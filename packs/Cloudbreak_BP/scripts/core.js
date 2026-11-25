import { BlockPermutation, BlockStates, BlockVolume, system, world } from "@minecraft/server";
import { CONFIG, ORES, UPGRADES } from "./config.js";
import { allClans, clanOf, onlineMembers, saveClan, tellClan } from "./clans.js";
import { addLedger, bankOf, spend } from "./bank.js";
import { clanAt, inBorder, inIslandArea } from "./islands.js";
import { fmt, setSellMultiplier } from "./eco/economy.js";
import { countSpawnersWhere, setSpawnerRoom } from "./eco/spawners.js";

// ---------------------------------------------------------------------------
// The Island Core: hourly tax, the shield and the upgrades.
//   clan.up          { [upgradeId]: level }
//   clan.taxSeconds  online seconds since the last tax payment
//   clan.unpaidSince timestamp of the first failed payment (grace running)
//   clan.shieldDown  true once the grace ran out: upgrades off, Cheap Raids can hit it
// ---------------------------------------------------------------------------

const K = CONFIG.core;
const overworld = () => world.getDimension("overworld");

export const upgradeDef = (id) => UPGRADES.find((u) => u.id === id);
export const levelOf = (clan, id) => clan?.up?.[id] ?? 0;
export const shieldUp = (clan) => !!clan && !clan.shieldDown;
/** The level that is working right now: 0 while the tax is unpaid (Island Size always works). */
export const activeLevel = (clan, id) => (id === "size" || shieldUp(clan) ? levelOf(clan, id) : 0);
export const coreLevel = (clan) => UPGRADES.reduce((n, u) => n + levelOf(clan, u.id), 0);
export const upgradeCost = (u, nextLevel) => u.base * 2 ** (nextLevel - 1);

export const sellMult = (clan) => 1 + 0.25 * activeLevel(clan, "sell");
export const spawnerCap = (clan) => 10 + 5 * activeLevel(clan, "spawners");
export const cropMult = (clan) => 1 + 0.25 * activeLevel(clan, "crops");
export const raidImmunityHours = (clan) => CONFIG.raid.immunityHours + 3 * activeLevel(clan, "shield");
export const defenceSeconds = (clan) => Math.max(60, CONFIG.raid.bridgeSeconds - 30 * activeLevel(clan, "defence"));
export const raidLives = (clan) => CONFIG.raid.lives + activeLevel(clan, "lives");

/** Hours of tax the bank can pay for. */
export const hoursCovered = (clan) => Math.floor(bankOf(clan) / K.taxPerHour);
/** Minutes of online time until the next tax payment. */
export const minutesToTax = (clan) => Math.max(0, Math.ceil((3600 - (clan.taxSeconds ?? 0)) / 60));

export function buyUpgrade(player, id) {
  const clan = clanOf(player);
  if (!clan) return { ok: false, msg: "You are not in a clan." };
  const u = upgradeDef(id);
  if (!u) return { ok: false, msg: "Unknown upgrade." };
  const lvl = levelOf(clan, id);
  if (lvl >= u.max) return { ok: false, msg: `${u.name} is already maxed.` };
  const cost = upgradeCost(u, lvl + 1);
  const paid = spend(player, cost, `Upgrade: ${u.name} ${lvl + 1}`, true);
  if (!paid.ok) return paid;
  const c = paid.clan;
  c.up = { ...(c.up ?? {}), [id]: lvl + 1 };
  if (id === "size" && c.island) c.island.size = CONFIG.island.startSize + 25 * (lvl + 1);
  saveClan(c);
  tellClan(c, `§e${player.name}§7 upgraded §b${u.name}§7 to level §f${lvl + 1}§7: ${u.desc(lvl + 1)}.`);
  return { ok: true, msg: `${u.name} is now level ${lvl + 1}.` };
}

// ---------------------------------------------------------------------------
// Core block
// ---------------------------------------------------------------------------

export const coreLocation = (clan) => ({ x: clan.island.x, y: clan.island.y + 1, z: clan.island.z - 3 });

/** Puts the core block on the island if it is missing (the chunk must be loaded). */
export function ensureCore(clan) {
  if (!clan?.island) return;
  try {
    const b = overworld().getBlock(coreLocation(clan));
    if (b && b.typeId !== K.block) b.setPermutation(BlockPermutation.resolve(K.block));
  } catch {
    /* chunk not loaded: try again next time someone is home */
  }
}

// ---------------------------------------------------------------------------
// Tax
// ---------------------------------------------------------------------------

function payTax(clan) {
  if (bankOf(clan) >= K.taxPerHour) {
    clan.bank = bankOf(clan) - K.taxPerHour;
    addLedger(clan, "Core tax", "Island core", -K.taxPerHour);
    const wasDown = clan.shieldDown;
    clan.unpaidSince = undefined;
    clan.shieldDown = false;
    clan.owed = false;
    if (wasDown) tellClan(clan, "§aCore tax paid. Your shield is back up and your upgrades work again.");
    return true;
  }
  return false;
}

function taxTick() {
  const now = Date.now();
  for (const clan of allClans()) {
    if (!clan.island) continue;
    let changed = false;
    const online = onlineMembers(clan).length > 0;
    if (online) {
      clan.taxSeconds = (clan.taxSeconds ?? 0) + 60;
      changed = true;
      if (clan.taxSeconds >= 3600) {
        clan.taxSeconds -= 3600;
        if (!payTax(clan)) {
          clan.owed = true;
          if (!clan.unpaidSince) {
            clan.unpaidSince = now;
            tellClan(clan, `§cThe clan bank can't pay the core tax (${fmt(K.taxPerHour)}). Deposit within ${K.graceMinutes} minutes or your shield drops!`);
          }
        }
      }
    }
    // a payment is owed: retry every minute, drop the shield when the grace runs out
    if (clan.owed) {
      if (payTax(clan)) changed = true;
      else if (!clan.shieldDown && clan.unpaidSince && now - clan.unpaidSince >= K.graceMinutes * 60000) {
        clan.shieldDown = true;
        changed = true;
        tellClan(clan, "§4Your core tax is unpaid. Your shield is DOWN: upgrades are off and Cheap Raids can hit your island. Deposit to fix it.");
      }
    }
    if (changed) saveClan(clan);
  }
}

/** Call after a deposit: pays any tax that is owed straight away. */
export function settleTax(clan) {
  if (clan?.owed && payTax(clan)) saveClan(clan);
}

// ---------------------------------------------------------------------------
// Island Fly (needs Education Edition on: /ability)
// ---------------------------------------------------------------------------

const flying = new Set();
let abilityWarned = false;

function setFly(player, on) {
  let ok = false;
  try {
    const r = player.runCommand(`ability @s mayfly ${on}`);
    ok = (r?.successCount ?? 1) > 0;
  } catch {
    ok = false;
  }
  if (on && !ok) {
    if (!abilityWarned) {
      abilityWarned = true;
      console.warn("[cloudbreak] Island Fly needs Education Edition turned on in the world settings.");
    }
    flying.add(player.id); // don't retry every tick; it is cleared when they leave the island
    player.sendMessage(`${CONFIG.prefix}§cIsland Fly needs Education Edition switched on in the world settings. Ask an admin.`);
    return;
  }
  if (on) flying.add(player.id);
  else {
    flying.delete(player.id);
    // don't drop them into the void when flight switches off mid-air
    try {
      player.addEffect("slow_falling", 200, { showParticles: false });
    } catch {}
  }
}

const isCreative = (p) => {
  const m = String(p.getGameMode?.() ?? "").toLowerCase();
  return m === "creative" || m === "spectator";
};

function flyTick() {
  for (const p of world.getPlayers()) {
    if (isCreative(p)) {
      flying.delete(p.id); // creative flying is the game's, not ours
      continue;
    }
    const clan = clanOf(p);
    const here = clanAt(p.dimension.id, p.location);
    const allowed = !!clan && here?.id === clan.id && inBorder(clan, p.location) && activeLevel(clan, "fly") > 0 && !p.hasTag("cb:inraid") && !p.hasTag("cb:pvp");
    if (allowed && !flying.has(p.id)) setFly(p, true);
    else if (!allowed && flying.has(p.id)) setFly(p, false);
  }
}

// ---------------------------------------------------------------------------
// Ore Generator: a cobblestone generator sometimes refills with an ore
// ---------------------------------------------------------------------------

const GEN_BLOCKS = new Set(["minecraft:cobblestone", "minecraft:stone"]);
const LAVA = new Set(["minecraft:lava", "minecraft:flowing_lava"]);

function nearLava(dim, loc) {
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
    try {
      if (LAVA.has(dim.getBlock({ x: loc.x + dx, y: loc.y + dy, z: loc.z + dz })?.typeId)) return true;
    } catch {}
  }
  return false;
}

function pickOre(level) {
  const pool = ORES.slice(0, level);
  let r = Math.random() * pool.reduce((n, o) => n + o[1], 0);
  for (const [id, w] of pool) if ((r -= w) <= 0) return id;
  return pool[0][0];
}

function onGeneratorBreak(dim, loc, typeId) {
  if (!GEN_BLOCKS.has(typeId) || !inIslandArea(dim.id, loc)) return;
  const clan = clanAt(dim.id, loc);
  const lvl = activeLevel(clan, "ore");
  if (!lvl || !nearLava(dim, loc)) return;
  // wait for the generator to refill, then maybe swap the new block for an ore
  system.runTimeout(() => {
    try {
      const b = dim.getBlock(loc);
      if (b && GEN_BLOCKS.has(b.typeId) && Math.random() < 0.04 * lvl) b.setPermutation(BlockPermutation.resolve(pickOre(lvl)));
    } catch {}
  }, 30);
}

// ---------------------------------------------------------------------------
// Crop Growth: extra growth for crops near clan members on their own island
// ---------------------------------------------------------------------------

const CROPS = [
  "minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot", "minecraft:melon_stem",
  "minecraft:pumpkin_stem", "minecraft:nether_wart", "minecraft:sweet_berry_bush", "minecraft:cocoa",
  "minecraft:torchflower_crop", "minecraft:pitcher_crop",
];
const GROWTH_STATES = ["growth", "age"];
const STAGE_SECONDS = 68; // rough vanilla time per growth stage

function growCrops() {
  for (const p of world.getPlayers()) {
    const clan = clanOf(p);
    if (!clan || clanAt(p.dimension.id, p.location)?.id !== clan.id) continue;
    const extra = cropMult(clan) - 1;
    if (extra <= 0) continue;
    const chance = (extra * 5) / STAGE_SECONDS;
    const l = p.location;
    const from = { x: Math.floor(l.x) - 12, y: Math.floor(l.y) - 6, z: Math.floor(l.z) - 12 };
    const to = { x: from.x + 24, y: from.y + 12, z: from.z + 24 };
    let blocks;
    try {
      blocks = p.dimension.getBlocks(new BlockVolume(from, to), { includeTypes: CROPS }, false);
    } catch {
      continue;
    }
    for (const loc of blocks.getBlockLocationIterator()) {
      if (Math.random() > chance || !inBorder(clan, loc)) continue;
      try {
        const b = p.dimension.getBlock(loc);
        const perm = b?.permutation;
        const states = perm?.getAllStates() ?? {};
        const key = GROWTH_STATES.find((k) => k in states);
        if (!key) continue;
        const max = Math.max(...(BlockStates.get(key)?.validValues ?? [7]).map(Number));
        const cap = b.typeId === "minecraft:cocoa" ? 2 : b.typeId === "minecraft:nether_wart" || b.typeId === "minecraft:sweet_berry_bush" ? 3 : max;
        if (states[key] < cap) b.setPermutation(perm.withState(key, states[key] + 1));
      } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

let openTerminal = () => {};
export const setCoreTerminal = (fn) => (openTerminal = fn);

export function registerCore() {
  world.afterEvents.worldLoad.subscribe(() => {
    system.runInterval(taxTick, 1200); // every minute
    system.runInterval(flyTick, 40);
    system.runInterval(growCrops, 100); // every 5 seconds
  });

  setSellMultiplier((player) => sellMult(clanOf(player)));

  // Spawner Cap: spawners inside the island border, counting stacks
  setSpawnerRoom((player, dimId, loc) => {
    if (!inIslandArea(dimId, loc)) return Infinity;
    const clan = clanAt(dimId, loc);
    if (!clan) return Infinity;
    const used = countSpawnersWhere((d) => d.dim === dimId && inBorder(clan, d));
    return spawnerCap(clan) - used;
  });

  world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation, dimension }) => {
    onGeneratorBreak(dimension, block.location, brokenBlockPermutation.type.id);
  });

  // The core can't be broken or blown up; tapping it opens the Core Terminal.
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (ev.block.typeId === K.block) ev.cancel = true;
  });
  world.beforeEvents.explosion.subscribe((ev) => {
    const blocks = ev.getImpactedBlocks();
    const keep = blocks.filter((b) => b.typeId !== K.block);
    if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (ev.block.typeId !== K.block) return;
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const player = ev.player;
    const clan = clanAt(ev.block.dimension.id, ev.block.location);
    system.run(() => {
      const own = clanOf(player);
      if (!own || own.id !== clan?.id) {
        player.sendMessage(`${CONFIG.prefix}§cThis is ${clan ? clan.name + "'s" : "another clan's"} Island Core.`);
        return;
      }
      Promise.resolve(openTerminal(player)).catch((e) => console.warn(`[cloudbreak] terminal: ${e}`));
    });
  });

  world.afterEvents.playerLeave.subscribe(({ playerId }) => flying.delete(playerId));
}


// for the offline rule tests (tools) only
export const _taxTickForTests = () => taxTick();
