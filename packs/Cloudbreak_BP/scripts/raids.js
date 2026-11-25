import { BlockPermutation, BlockVolume, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { allClans, canManage, clanOf, getClan, onlineMembers, saveClan, tellClan } from "./clans.js";
import { addLedger, bankOf, clanWorth, spend } from "./bank.js";
import { clanAt, inBorder, inSpawnZone, sendHome, setRaidRule, spawnLocation } from "./islands.js";
import { defenceSeconds, raidLives, shieldUp } from "./core.js";
import { fmt } from "./eco/economy.js";
import { countSpawnersWhere, setSpawnerManageOverride } from "./eco/spawners.js";
import { pref } from "./eco/playerSettings.js";
import { showTitle } from "./titles.js";

// ---------------------------------------------------------------------------
// Raids
//
// raid = {
//   id, type, attacker, target (clan ids), price, buyer (player id),
//   phase: "bridge" | "loot", started, bridgeEnd, lootEnd, backOutUntil,
//   raiders: { [playerId]: { name, lives, out } },
//   launch: { x, y, z, dir: [dx, dz] }, placed: ["x,y,z", ...], stolen, bonus
// }
// Raids live in memory and are saved every few seconds. After a server
// restart they end cleanly: raiders go home and nothing is paid.
// ---------------------------------------------------------------------------

const R = CONFIG.raid;
const overworld = () => world.getDimension("overworld");
const raids = new Map();
const TAG_RAIDER = "cb:inraid";
const TAG_PVP = "cb:pvp";
const CORE = CONFIG.core.block;

// After-raid systems (insurance, logs, keys, leaderboards) plug in here.
let onRaidEnd = () => {};
export const setRaidEndHook = (fn) => (onRaidEnd = fn);

const key = (l) => `${Math.floor(l.x)},${Math.floor(l.y)},${Math.floor(l.z)}`;
const unkey = (k) => {
  const [x, y, z] = k.split(",").map(Number);
  return { x, y, z };
};
const now = () => Date.now();
const fail = (msg) => ({ ok: false, msg });

export const activeRaids = () => [...raids.values()];
export const raidOfClan = (clanId) => activeRaids().find((r) => r.attacker === clanId || r.target === clanId);
export const raidAgainst = (clanId) => activeRaids().find((r) => r.target === clanId);
export const raidBy = (clanId) => activeRaids().find((r) => r.attacker === clanId);
export const raidOfPlayer = (player) => activeRaids().find((r) => r.raiders[player.id] && !r.raiders[player.id].out);

function persist() {
  try {
    world.setDynamicProperty("cb:raids", JSON.stringify(activeRaids()));
  } catch (e) {
    console.warn(`[cloudbreak] could not save raids: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Who can be raided
// ---------------------------------------------------------------------------

export function isImmune(clan) {
  return (clan.immuneUntil ?? 0) > now() || now() - (clan.created ?? 0) < R.newClanDays * 86400000;
}

function eligible(attacker, target, type) {
  if (!target.island || target.id === attacker.id) return false;
  if (onlineMembers(target).length === 0) return false;
  if (raidOfClan(target.id)) return false;
  if (type === "revenge") return true; // revenge ignores immunity, not online/busy rules
  if (isImmune(target)) return false;
  if (type === "cheap") return !shieldUp(target);
  return true;
}

export function targetsFor(attacker, type) {
  if (type === "revenge") {
    const rv = attacker.revenge;
    if (!rv || rv.until < now()) return [];
    const t = getClan(rv.clanId);
    return t && eligible(attacker, t, type) ? [t] : [];
  }
  return allClans().filter((t) => eligible(attacker, t, type));
}

export const priceOf = (type) => R.prices[type];

export function revengeAvailable(clan) {
  const rv = clan?.revenge;
  return !!rv && rv.until > now() ? getClan(rv.clanId) : undefined;
}

/** Hints shown before deploying an Intel Raid. */
export function intelOf(target) {
  const spawners = countSpawnersWhere((d) => d.dim === "minecraft:overworld" && inBorder(target, d));
  const b = bankOf(target);
  const bank = b >= 5e6 ? "$5M+" : b >= 1e6 ? "$1M - $5M" : b >= 5e5 ? "$500k - $1M" : b >= 1e5 ? "$100k - $500k" : "under $100k";
  return { spawners, bank, online: onlineMembers(target).length, members: Object.keys(target.members).length };
}

// ---------------------------------------------------------------------------
// Buying a raid
// ---------------------------------------------------------------------------

/** Step 1: check and pick a target. Nothing is paid yet. */
export function prepareRaid(player, type) {
  const clan = clanOf(player);
  if (!clan) return fail("You are not in a clan.");
  if (!canManage(clan, player.id)) return fail("Only the Owner and Co-Owners can buy raids.");
  if (raidOfClan(clan.id)) return fail("Your clan is already in a raid.");
  if (!clan.island) return fail("Your clan needs an island first.");
  const price = priceOf(type);
  if (price === undefined) return fail("Unknown raid type.");
  if (bankOf(clan) < price) return fail(`The clan bank needs ${fmt(price)} for this raid.`);
  const list = targetsFor(clan, type);
  if (!list.length) {
    const why = {
      cheap: "No island has its shield down right now (or none of them are online).",
      revenge: "Your revenge target isn't online right now, or is busy in another raid.",
    }[type];
    return fail(why ?? "No clan can be raided right now. Clans need a member online and no raid shield.");
  }
  const target = list[Math.floor(Math.random() * list.length)];
  return { ok: true, clan, target, type, price };
}

/** Step 2: pay and go. */
export async function launchRaid(player, prep) {
  const { clan, target, type, price } = prep;
  // things can change while a menu was open: check again
  if (raidOfClan(clan.id) || raidOfClan(target.id)) return fail("That raid isn't possible any more. Nothing was paid.");
  const paid = spend(player, price, `Raid bought (${type})`);
  if (!paid.ok) return paid;
  if (type === "revenge") {
    clan.revenge = undefined;
    saveClan(getClan(clan.id) ?? clan);
  }

  // launch island: 60 blocks out from one side of the target's border
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dir = dirs[Math.floor(Math.random() * 4)];
  const half = target.island.size / 2;
  const dist = half + R.launchDistance + 3;
  const launch = { x: target.island.x + dir[0] * dist, y: target.island.y, z: target.island.z + dir[1] * dist, dir };

  const squad = onlineMembers(clan);
  const raid = {
    id: `r${now()}`,
    type, price, buyer: player.id,
    attacker: clan.id, target: target.id,
    phase: "bridge",
    started: now(),
    backOutUntil: now() + R.backOutSeconds * 1000,
    bridgeEnd: now() + defenceSeconds(target) * 1000,
    raiders: Object.fromEntries(squad.map((p) => [p.id, { name: p.name, lives: raidLives(clan), out: false }])),
    launch, placed: [], stolen: 0, bonus: 0,
  };
  raids.set(raid.id, raid);
  persist();

  // send the squad
  const dim = overworld();
  const facing = { x: target.island.x + 0.5, y: target.island.y + 1, z: target.island.z + 0.5 };
  for (const p of squad) {
    p.teleport({ x: launch.x + 0.5, y: launch.y + 2, z: launch.z + 0.5 }, { dimension: dim, facingLocation: facing });
    p.addEffect("slow_falling", 200, { showParticles: false });
    p.addTag(TAG_RAIDER);
    p.addTag(TAG_PVP);
  }
  // build the launch island once the chunk has loaded
  for (let i = 0; i < 40; i++) {
    try {
      if (dim.getBlock(launch)?.isValid) break;
    } catch {}
    await system.waitTicks(5);
  }
  try {
    dim.fillBlocks(new BlockVolume({ x: launch.x - 3, y: launch.y, z: launch.z - 3 }, { x: launch.x + 3, y: launch.y, z: launch.z + 3 }), "minecraft:polished_blackstone_bricks");
    dim.fillBlocks(new BlockVolume({ x: launch.x - 2, y: launch.y - 1, z: launch.z - 2 }, { x: launch.x + 2, y: launch.y - 1, z: launch.z + 2 }), "minecraft:blackstone");
  } catch (e) {
    console.warn(`[cloudbreak] launch island: ${e}`);
  }
  for (const p of squad) {
    if (!p.isValid) continue;
    p.setSpawnPoint({ dimension: dim, x: launch.x + 0.5, y: launch.y + 1, z: launch.z + 0.5 });
    showTitle(p, "§cRAID", `§fTarget: §e${target.name}`, 60);
    p.sendMessage(`${CONFIG.prefix}§cRaiding §e${target.name}§7! Bridge to their island within §f${Math.round(defenceSeconds(target) / 60 * 10) / 10} min§7. You have §f${raidLives(clan)}§7 lives. Back out within ${R.backOutSeconds}s with §f/sc back§7 for a ${Math.round(R.backOutRefund * 100)}% refund.`);
  }
  alertDefenders(raid);
  return { ok: true, msg: `Raid on ${target.name} started.`, raid };
}

function alertDefenders(raid) {
  const target = getClan(raid.target);
  const attacker = getClan(raid.attacker);
  for (const p of onlineMembers(target)) {
    showTitle(p, "§cRAID INCOMING", "§fRun §e/is §fto defend your island!", 80);
    p.sendMessage(`${CONFIG.prefix}§c${Object.keys(raid.raiders).length} raiders from §e${attacker?.name ?? "a clan"}§c are bridging to your island! Type §f/is§c to go home and defend.`);
    if (pref(p, "raidsound", true)) p.playSound("raid.horn", { volume: 1 });
  }
}

/** Raiders can back out in the first seconds for a partial refund. */
export function backOut(player) {
  const raid = raidOfPlayer(player);
  if (!raid) return fail("You are not in a raid.");
  const clan = getClan(raid.attacker);
  if (!canManage(clan, player.id) && raid.buyer !== player.id) return fail("Only the Owner or a Co-Owner can call off the raid.");
  if (now() > raid.backOutUntil || raid.phase !== "bridge") return fail("It's too late to back out.");
  const refund = Math.floor(raid.price * R.backOutRefund);
  clan.bank = bankOf(clan) + refund;
  addLedger(clan, "Raid called off (refund)", player.name, refund);
  saveClan(clan);
  finish(raid, "backout");
  return { ok: true, msg: `Raid called off. ${fmt(refund)} went back to the clan bank.` };
}

// ---------------------------------------------------------------------------
// Running raids
// ---------------------------------------------------------------------------

/** Blocks from x/z to the target's border (0 = on the island). */
export function distanceToBorder(target, loc) {
  const half = target.island.size / 2;
  const dx = Math.max(0, Math.abs(loc.x - target.island.x - 0.5) - half);
  const dz = Math.max(0, Math.abs(loc.z - target.island.z - 0.5) - half);
  return Math.ceil(Math.max(dx, dz));
}

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Live numbers for the sidebar / action bar. */
export function raidStatus(raid) {
  const target = getClan(raid.target);
  const live = Object.entries(raid.raiders).filter(([, r]) => !r.out).map(([id]) => world.getEntity(id)).filter((p) => p?.isValid);
  const dist = target ? Math.min(...live.map((p) => distanceToBorder(target, p.location)), 999) : 999;
  const left = raid.phase === "loot" ? raid.lootEnd - now() : raid.bridgeEnd - now();
  return {
    phase: raid.phase,
    raiders: live.length,
    distance: dist,
    timeLeft: mmss(left),
    defenders: target ? onlineMembers(target).length : 0,
    targetName: target?.name ?? "?",
    attackerName: getClan(raid.attacker)?.name ?? "?",
    stolen: raid.stolen + raid.bonus,
  };
}

function win(raid) {
  const target = getClan(raid.target);
  const attacker = getClan(raid.attacker);
  if (!target || !attacker) return finish(raid, "cancelled");
  const stolen = Math.floor(bankOf(target) * R.bankStolen);
  const bonus = clanWorth(attacker) < clanWorth(target) ? Math.floor(stolen * R.underdogBonus) : 0;
  target.bank = bankOf(target) - stolen;
  addLedger(target, `Raided by ${attacker.name}`, "Raiders", -stolen);
  attacker.bank = bankOf(attacker) + stolen + bonus;
  addLedger(attacker, `Raid won vs ${target.name}`, "Raid", stolen);
  if (bonus) addLedger(attacker, "Underdog bonus", "Server", bonus);
  saveClan(target);
  saveClan(attacker);
  raid.stolen = stolen;
  raid.bonus = bonus;
  raid.phase = "loot";
  raid.lootEnd = now() + R.lootSeconds * 1000;
  persist();
  const lootMin = Math.round(R.lootSeconds / 60);
  for (const p of onlineMembers(attacker)) {
    if (!raid.raiders[p.id]) continue;
    showTitle(p, "§aRAID WON", `§f+${fmt(stolen + bonus)} · loot for ${lootMin} min`, 60);
  }
  tellClan(attacker, `§aYou landed on §e${target.name}§a! Stole §f${fmt(stolen)}${bonus ? `§a + §f${fmt(bonus)}§a underdog bonus` : ""}§a. Loot for ${lootMin} minutes.`);
  tellClan(target, `§c${attacker.name} landed on your island and stole §f${fmt(stolen)}§c. They can loot for ${lootMin} minutes!`);
}

function finish(raid, outcome) {
  if (!raids.has(raid.id)) return;
  raids.delete(raid.id);
  const dim = overworld();
  const target = getClan(raid.target);
  // 1. clean up blocks while the raiders still keep the chunks loaded
  const leftovers = [];
  const clear = (loc) => {
    try {
      const b = dim.getBlock(loc);
      if (!b) return leftovers.push(key(loc));
      if (b.typeId !== "minecraft:air") b.setPermutation(BlockPermutation.resolve("minecraft:air"));
    } catch {
      leftovers.push(key(loc));
    }
  };
  for (const k of raid.placed) {
    const loc = unkey(k);
    if (!target || !inBorder(target, loc)) clear(loc);
  }
  const L = raid.launch;
  for (let dx = -3; dx <= 3; dx++)
    for (let dz = -3; dz <= 3; dz++)
      for (const dy of [-1, 0]) clear({ x: L.x + dx, y: L.y + dy, z: L.z + dz });
  if (leftovers.length) {
    const queue = JSON.parse(String(world.getDynamicProperty("cb:cleanup") ?? "[]"));
    world.setDynamicProperty("cb:cleanup", JSON.stringify([...queue, ...leftovers].slice(-5000)));
  }
  // 2. raiders go home, defenders stop being PvP targets
  for (const id of Object.keys(raid.raiders)) {
    const p = world.getEntity(id);
    if (p?.isValid) releaseRaider(p);
  }
  if (target) for (const p of onlineMembers(target)) p.removeTag(TAG_PVP);
  persist();
  // 3. outcome effects
  const attacker = getClan(raid.attacker);
  if (outcome === "defended" && attacker && target) {
    tellClan(target, `§aYou held off §e${attacker.name}§a! Their raid fee (${fmt(raid.price)}) goes to your clan bank.`);
    tellClan(attacker, `§cThe raid on §e${target.name}§c failed.`);
    target.bank = bankOf(target) + raid.price;
    addLedger(target, `Raid defended vs ${attacker.name}`, "Raid", raid.price);
    saveClan(target);
  } else if (outcome === "backout" && target) {
    tellClan(target, "§aThe raiders backed out. Your island is safe.");
  } else if (outcome === "won" && attacker && target) {
    tellClan(attacker, "§7Loot time is over. You've been sent home.");
    tellClan(target, "§7The raiders have left your island.");
  }
  try {
    onRaidEnd(raid, outcome);
  } catch (e) {
    console.warn(`[cloudbreak] raid end hook: ${e}`);
  }
}

function releaseRaider(p) {
  p.removeTag(TAG_RAIDER);
  p.removeTag(TAG_PVP);
  const clan = clanOf(p);
  if (clan?.island) {
    p.setSpawnPoint({ dimension: overworld(), ...spawnLocation(clan) });
    sendHome(p, clan).catch(() => {});
  } else {
    try {
      p.setSpawnPoint(undefined);
    } catch {}
  }
}

function tick() {
  for (const raid of activeRaids()) {
    const target = getClan(raid.target);
    const attacker = getClan(raid.attacker);
    if (!target?.island || !attacker) {
      finish(raid, "cancelled");
      continue;
    }
    const t = now();
    // raiders still in the game
    const live = Object.entries(raid.raiders)
      .filter(([, r]) => !r.out)
      .map(([id]) => world.getEntity(id))
      .filter((p) => p?.isValid);
    if (raid.phase === "bridge") {
      if (live.some((p) => p.dimension.id === "minecraft:overworld" && inBorder(target, p.location) && p.location.y >= target.island.y - 12)) {
        win(raid);
        continue;
      }
      if (t > raid.bridgeEnd || live.length === 0) {
        finish(raid, "defended");
        continue;
      }
    } else if (raid.phase === "loot") {
      if (t > raid.lootEnd || live.length === 0) {
        finish(raid, "won");
        continue;
      }
    }
    // defenders on their island can fight (and be fought)
    for (const p of onlineMembers(target)) {
      const home = p.dimension.id === "minecraft:overworld" && clanAt(p.dimension.id, p.location)?.id === target.id;
      if (home && !p.hasTag(TAG_PVP)) p.addTag(TAG_PVP);
      if (!home && p.hasTag(TAG_PVP)) p.removeTag(TAG_PVP);
    }
  }
}

function cleanupTick() {
  const queue = JSON.parse(String(world.getDynamicProperty("cb:cleanup") ?? "[]"));
  if (!queue.length) return;
  const dim = overworld();
  const left = queue.filter((k) => {
    try {
      const b = dim.getBlock(unkey(k));
      if (!b) return true;
      if (b.typeId !== "minecraft:air") b.setPermutation(BlockPermutation.resolve("minecraft:air"));
      return false;
    } catch {
      return true;
    }
  });
  world.setDynamicProperty("cb:cleanup", left.length ? JSON.stringify(left) : undefined);
}

// ---------------------------------------------------------------------------
// Rules during raids (building, looting, PvP, deaths)
// ---------------------------------------------------------------------------

function raidRule(player, dimId, loc, action, blockType) {
  if (dimId !== "minecraft:overworld") return undefined;
  const k = key(loc);
  const raid = raidOfPlayer(player);
  if (raid) {
    const target = getClan(raid.target);
    if (!target?.island) return undefined;
    if (clanAt(dimId, loc)?.id !== target.id && !inLaunchArea(raid, loc)) return undefined;
    const onIsland = inBorder(target, loc);
    const loot = raid.phase === "loot";
    if (action === "interact") return "allow";
    if (action === "open") return onIsland && loot ? "allow" : undefined;
    if (action === "place") {
      if (!onIsland) return "allow";
      if (!loot) return "Land on the island first.";
      return inSpawnZone(target, loc) ? "The spawn zone is protected." : "allow";
    }
    if (action === "break") {
      if (raid.placed.includes(k)) return "allow";
      if (onIsland && loot && !inSpawnZone(target, loc) && blockType !== CORE) return "allow";
      return onIsland && !loot ? "Land on the island first." : "You can't break that during a raid.";
    }
    return undefined;
  }
  // defenders may knock down the raiders' bridge
  const own = clanOf(player);
  const against = own && raidAgainst(own.id);
  if (against && against.placed.includes(k) && (action === "break" || action === "interact")) return "allow";
  return undefined;
}

function inLaunchArea(raid, loc) {
  return Math.abs(loc.x - raid.launch.x) <= 4 && Math.abs(loc.z - raid.launch.z) <= 4;
}

export function registerRaids() {
  setRaidRule(raidRule);

  // looting raiders can pick up spawners on the target island (also in its spawn zone)
  setSpawnerManageOverride((player, d) => {
    const raid = raidOfPlayer(player);
    if (!raid || raid.phase !== "loot") return false;
    const target = getClan(raid.target);
    return !!target && d.dim === "minecraft:overworld" && inBorder(target, d);
  });

  world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
    const raid = raidOfPlayer(player);
    if (!raid || block.dimension.id !== "minecraft:overworld") return;
    const k = key(block.location);
    if (!raid.placed.includes(k)) raid.placed.push(k);
  });

  // PvP only between players tagged for a raid
  world.beforeEvents.entityHurt.subscribe((ev) => {
    const victim = ev.hurtEntity;
    const src = ev.damageSource?.damagingEntity;
    if (victim?.typeId !== "minecraft:player" || src?.typeId !== "minecraft:player" || src.id === victim.id) return;
    if (!(victim.hasTag(TAG_PVP) && src.hasTag(TAG_PVP))) ev.cancel = true;
  });

  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (deadEntity.typeId !== "minecraft:player") return;
    const raid = raidOfPlayer(deadEntity);
    if (!raid) return;
    const r = raid.raiders[deadEntity.id];
    r.lives -= 1;
    if (r.lives <= 0) {
      r.out = true;
      deadEntity.sendMessage(`${CONFIG.prefix}§cYou're out of lives. You'll be sent home.`);
    } else {
      deadEntity.sendMessage(`${CONFIG.prefix}§eYou have §f${r.lives}§e ${r.lives === 1 ? "life" : "lives"} left. Back to the launch island!`);
    }
    persist();
  });

  world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    system.runTimeout(() => {
      if (!player.isValid) return;
      if (player.hasTag(TAG_PVP) && !raidOfPlayer(player)) {
        const own = clanOf(player);
        if (!own || !raidAgainst(own.id)) player.removeTag(TAG_PVP);
      }
      if (!player.hasTag(TAG_RAIDER)) return;
      const raid = raidOfPlayer(player);
      if (!raid) {
        // out of lives, raid over, or the server restarted: go home
        releaseRaider(player);
        if (initialSpawn) player.sendMessage(`${CONFIG.prefix}§7Your raid ended while you were away.`);
      }
    }, 10);
  });

  world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    for (const raid of activeRaids()) {
      const r = raid.raiders[playerId];
      if (r && !r.out) {
        r.out = true;
        persist();
      }
    }
  });

  world.afterEvents.worldLoad.subscribe(() => {
    // raids saved before a restart end cleanly: no payouts, cleanup queued
    try {
      const saved = JSON.parse(String(world.getDynamicProperty("cb:raids") ?? "[]"));
      if (saved.length) {
        const queue = JSON.parse(String(world.getDynamicProperty("cb:cleanup") ?? "[]"));
        for (const raid of saved) {
          const target = getClan(raid.target);
          for (const k of raid.placed ?? []) if (!target || !inBorder(target, unkey(k))) queue.push(k);
          const L = raid.launch;
          for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (const dy of [-1, 0]) queue.push(key({ x: L.x + dx, y: L.y + dy, z: L.z + dz }));
        }
        world.setDynamicProperty("cb:cleanup", JSON.stringify(queue.slice(-5000)));
        world.setDynamicProperty("cb:raids", undefined);
      }
    } catch (e) {
      console.warn(`[cloudbreak] old raids: ${e}`);
    }
    system.runInterval(tick, 10);
    system.runInterval(() => raids.size && persist(), 200);
    system.runInterval(cleanupTick, 200);
    for (const p of world.getPlayers()) if (p.hasTag(TAG_RAIDER) && !raidOfPlayer(p)) releaseRaider(p);
  });
}


// for the offline rule tests (tools) only
export const _tickForTests = () => tick();
