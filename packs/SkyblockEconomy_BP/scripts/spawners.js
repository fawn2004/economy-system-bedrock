import { ItemStack, system, world } from "@minecraft/server";
import { CONFIG, SPAWNERS, SPAWNER_SETTINGS as S } from "./config.js";
import { container } from "./inventory.js";
import { headChanceBonus } from "./tools.js";
import { addHeadsCollected } from "./leaderboards.js";
import { ICON, fail, success, tileMenu } from "./ui.js";

// ============================================================================
//  SPAWNERS
//  - Shop spawners are mob spawner items tagged with hidden lore (mob + level).
//  - Placing one loads a structure with a display-only spawner (the mob spins
//    inside but vanilla never spawns). This script does the spawning, so it can
//    handle stacking, upgrades, mob stacking and enchanted head drops.
//  - Each placed spawner is saved in a world dynamic property:
//      eco:sp:<dimension>:<x>,<y>,<z> = { mob, level, stack, owner, ownerName }
//  - Sneak + tap              -> spawner menu (info, upgrade, heads, pick up)
//    Tap holding the same spawner -> add it to the stack (sneak = add all)
//    Mining / explosions can't break them; the owner picks them up in the menu.
// ============================================================================

const TAG = "§8eco:spawner:";
const KEY_PREFIX = "eco:sp:";
const SPAWNER_BLOCK = "minecraft:mob_spawner";
const maxLevel = () => S.levels.length; // can change in-game (Admin > Settings)

const spawners = new Map(); // key -> { mob, level, stack, owner, ownerName, dim, x, y, z, timer, legacy }

const REPLACEABLE = new Set([
  "minecraft:air", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern",
  "minecraft:snow_layer", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava",
  "minecraft:deadbush", "minecraft:vine", "minecraft:short_dry_grass", "minecraft:tall_dry_grass",
]);
const FACE = {
  Up: { x: 0, y: 1, z: 0 }, Down: { x: 0, y: -1, z: 0 }, North: { x: 0, y: 0, z: -1 },
  South: { x: 0, y: 0, z: 1 }, East: { x: 1, y: 0, z: 0 }, West: { x: -1, y: 0, z: 0 },
};

// ---- helpers ---------------------------------------------------------------
const pretty = (mob) => mob.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const mobInfo = (mob) => SPAWNERS.find((s) => s.mob === mob);
export const mobName = (mob) => mobInfo(mob)?.name ?? pretty(mob);
export const mobIcon = (mob) => mobInfo(mob)?.icon ?? ICON.coin;
const entityType = (mob) => (mob.includes(":") ? mob : "minecraft:" + mob);
export const levelInfo = (lvl) => S.levels[Math.min(Math.max(1, lvl), maxLevel()) - 1];
export const upgradeCost = (d) => levelInfo(d.level + 1).cost * (S.costTimesStack === false ? 1 : d.stack);

const keyOf = (dimId, l) => `${KEY_PREFIX}${dimId}:${l.x},${l.y},${l.z}`;
function parseKey(key) {
  const rest = key.slice(KEY_PREFIX.length);
  const i = rest.lastIndexOf(":");
  const [x, y, z] = rest.slice(i + 1).split(",").map(Number);
  return { dim: rest.slice(0, i), x, y, z };
}
const isCreative = (p) => String(p.getGameMode()).toLowerCase() === "creative";
const isAdmin = (p) => p.hasTag(CONFIG.adminTag);
const canManage = (p, d) => !d.owner || d.owner === p.id || isAdmin(p);

function save(key, d) {
  spawners.set(key, d);
  world.setDynamicProperty(
    key,
    JSON.stringify({ mob: d.mob, level: d.level, stack: d.stack, owner: d.owner, ownerName: d.ownerName })
  );
}

function forget(key) {
  spawners.delete(key);
  world.setDynamicProperty(key, undefined);
}

function loadAll() {
  spawners.clear();
  for (const key of world.getDynamicPropertyIds()) {
    if (!key.startsWith(KEY_PREFIX)) continue;
    const raw = world.getDynamicProperty(key);
    let d;
    if (typeof raw === "string" && raw.startsWith("{")) {
      try {
        d = JSON.parse(raw);
      } catch {
        continue;
      }
    } else if (typeof raw === "string") {
      d = { mob: raw, level: 1, stack: 1, legacy: true }; // placed before v1.0.9
    } else continue;
    spawners.set(key, { level: 1, stack: 1, ...d, ...parseKey(key), timer: 0 });
  }
}

/** How many spawners (counting stacks) a player owns. */
export function ownedSpawnerCount(playerId) {
  let n = 0;
  for (const d of spawners.values()) if (d.owner === playerId) n += d.stack;
  return n;
}

// ---- spawner items ---------------------------------------------------------
export function makeSpawnerItem(mob, amount = 1, level = 1) {
  const stack = new ItemStack(SPAWNER_BLOCK, amount);
  stack.nameTag = `§r§d${mobName(mob)} Spawner${level > 1 ? ` §6[Lv ${level}]` : ""}`;
  stack.setLore([
    `§7Mob: §f${mobName(mob)}`,
    `§7Level: §f${level}§7/§f${maxLevel()}`,
    "§7Place it, then sneak and tap",
    "§7it to open its menu",
    `${TAG}${mob}:${level}`,
  ]);
  return stack;
}

/** -> { mob, level } for a shop spawner item, else undefined */
export function spawnerFromItem(item) {
  if (item?.typeId !== SPAWNER_BLOCK) return undefined;
  const line = item.getLore().find((l) => l.startsWith(TAG));
  if (!line) return undefined;
  const [mob, lvl] = line.slice(TAG.length).split(":");
  return { mob, level: Math.min(maxLevel(), Math.max(1, Number(lvl) || 1)) };
}

function takeFromHand(player, count = 1) {
  if (isCreative(player)) return;
  const inv = container(player);
  const slot = player.selectedSlotIndex;
  const held = inv?.getItem(slot);
  if (!held) return;
  if (held.amount > count) {
    held.amount -= count;
    inv.setItem(slot, held);
  } else inv.setItem(slot, undefined);
}

// ---- enchanted heads ---------------------------------------------------------
export const headItemId = (mob) => `eco:head_${mob}`;
export const headMob = (typeId) => (typeId?.startsWith("eco:head_") ? typeId.slice(9) : undefined);
export const getHeadPoints = (player, mob) => Number(player.getDynamicProperty(`eco:heads:${mob}`) ?? 0);
export function addHeadPoints(player, mob, n) {
  player.setDynamicProperty(`eco:heads:${mob}`, Math.max(0, getHeadPoints(player, mob) + n));
}

/** Head items in the player's inventory: Map mob -> count */
export function countHeads(player) {
  const inv = container(player);
  const out = new Map();
  if (!inv) return out;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    const mob = headMob(it?.typeId);
    if (mob) out.set(mob, (out.get(mob) ?? 0) + it.amount);
  }
  return out;
}

/** Turns head items into head points. mob = only that mob, else all. -> Map mob -> count */
export function depositHeads(player, mob) {
  const inv = container(player);
  const done = new Map();
  if (!inv) return done;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    const m = headMob(it?.typeId);
    if (!m || (mob && m !== mob)) continue;
    done.set(m, (done.get(m) ?? 0) + it.amount);
    inv.setItem(i, undefined);
  }
  for (const [m, n] of done) {
    addHeadPoints(player, m, n);
    addHeadsCollected(player, n); // lifetime heads (leaderboard)
  }
  return done;
}

export function allHeadPoints(player) {
  return SPAWNERS.map((s) => ({ mob: s.mob, points: getHeadPoints(player, s.mob) })).filter((h) => h.points > 0);
}

// ---- placing & stacking ------------------------------------------------------
function placeSpawner(player, block, face, info) {
  const target = REPLACEABLE.has(block.typeId) ? block : block.offset(FACE[face] ?? FACE.Up);
  if (!target || !REPLACEABLE.has(target.typeId)) return;
  const p = player.location;
  const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
  if (target.x === px && target.z === pz && (target.y === py || target.y === py + 1)) return;

  const loc = target.location;
  try {
    world.structureManager.place(`eco:spawner_${info.mob}`, player.dimension, loc);
  } catch {
    fail(player, `Missing spawner structure for "${info.mob}" - tell an admin.`);
    return;
  }
  const key = keyOf(player.dimension.id, loc);
  save(key, {
    mob: info.mob, level: info.level, stack: 1, owner: player.id, ownerName: player.name,
    dim: player.dimension.id, ...loc, timer: 0,
  });
  player.playSound("dig.stone");
  takeFromHand(player);
  player.sendMessage(`§a${mobName(info.mob)} Spawner placed. §7Sneak and tap it to open its menu.`);
}

function addToStack(player, key, info, all) {
  const d = spawners.get(key);
  if (!d) return;
  if (!canManage(player, d)) return fail(player, `Only ${d.ownerName ?? "the owner"} can add to this spawner.`);
  if (info.level !== d.level) return fail(player, `Only level ${d.level} ${mobName(d.mob)} spawners can stack onto this one.`);
  const room = S.maxStack - d.stack;
  if (room <= 0) return fail(player, `This spawner is full (${S.maxStack} max).`);
  const held = container(player)?.getItem(player.selectedSlotIndex);
  const n = Math.min(room, all ? held?.amount ?? 1 : 1);
  d.stack += n;
  save(key, d);
  takeFromHand(player, n);
  success(player, `Added ${n} spawner${n > 1 ? "s" : ""} - now x${d.stack}.`);
}

/** Adds every matching spawner item from the inventory to the stack. */
function addFromInventory(player, key) {
  const d = spawners.get(key);
  const inv = container(player);
  if (!d || !inv) return 0;
  let added = 0;
  for (let i = 0; i < inv.size && d.stack < S.maxStack; i++) {
    const it = inv.getItem(i);
    const info = spawnerFromItem(it);
    if (!info || info.mob !== d.mob || info.level !== d.level) continue;
    const n = Math.min(S.maxStack - d.stack, it.amount);
    d.stack += n;
    added += n;
    if (it.amount > n) {
      it.amount -= n;
      inv.setItem(i, it);
    } else inv.setItem(i, undefined);
  }
  if (added) save(key, d);
  return added;
}

function pickUp(player, key) {
  const d = spawners.get(key);
  if (!d) return;
  if (!canManage(player, d)) return fail(player, "This isn't your spawner.");
  const dim = world.getDimension(d.dim);
  try {
    dim.getBlock(d)?.setType("minecraft:air");
  } catch {}
  forget(key);
  let left = d.stack;
  while (left > 0) {
    const n = Math.min(64, left);
    const overflow = container(player)?.addItem(makeSpawnerItem(d.mob, n, d.level));
    if (overflow) player.dimension.spawnItem(overflow, player.location);
    left -= n;
  }
  success(player, `Picked up ${d.stack}x level ${d.level} ${mobName(d.mob)} Spawner.`);
}

function upgrade(player, key) {
  const d = spawners.get(key);
  if (!d) return "§cThat spawner is gone.";
  if (!canManage(player, d)) return "§cThis isn't your spawner.";
  if (d.level >= maxLevel()) return "§aThis spawner is already max level!";
  const cost = upgradeCost(d);
  const have = getHeadPoints(player, d.mob);
  if (have < cost) {
    fail(player, `You need ${cost} ${mobName(d.mob)} heads (you have ${have}).`);
    return `§cYou need §f${cost} §c${mobName(d.mob)} heads §7(you have ${have})`;
  }
  addHeadPoints(player, d.mob, -cost);
  d.level += 1;
  save(key, d);
  success(player, `${mobName(d.mob)} Spawner upgraded to level ${d.level}!`);
  player.playSound("random.levelup");
  return `§aUpgraded to level §f${d.level}§a!`;
}

// ---- spawner menu -------------------------------------------------------------
export async function spawnerMenu(player, key, msg) {
  const d = spawners.get(key);
  if (!d) return;
  const name = mobName(d.mob);
  const lvl = levelInfo(d.level);
  const next = d.level < maxLevel() ? levelInfo(d.level + 1) : undefined;
  const cost = next ? upgradeCost(d) : 0;
  const points = getHeadPoints(player, d.mob);
  const inBag = countHeads(player).get(d.mob) ?? 0;
  const manage = canManage(player, d);
  const perCycle = d.stack * S.mobsPerSpawn;

  const lines = [
    msg,
    `§f${name} Spawner   §7Owner: §f${d.ownerName ?? "?"}`,
    `§7Stack: §f${d.stack}§7/§f${S.maxStack}    §7Level: §6${d.level}§7/§6${maxLevel()}`,
    `§7Spawns §f${perCycle} §7mob${perCycle > 1 ? "s" : ""} every §f${lvl.interval}s   §7Head chance: §d${lvl.headChance}%`,
    next ? `§8Next level: every ${next.interval}s, ${next.headChance}% heads - costs ${cost} heads` : "§aMax level!",
    `§7Your ${name} heads: §d${points}${inBag ? `  §8(+${inBag} in your bag)` : ""}`,
  ].filter(Boolean);

  const reopen = (m) => spawnerMenu(player, key, m);
  const tiles = [];
  if (manage) {
    tiles.push({
      text: next ? "§a§lUPGRADE" : "§a§lMAX LEVEL",
      sub: next ? `${points >= cost ? "§d" : "§c"}${cost} heads` : `§7Level ${maxLevel()}`,
      icon: ICON.confirm,
      onClick: () => reopen(upgrade(player, key)),
    });
  }
  tiles.push({
    text: "§d§lADD HEADS",
    sub: `§7${inBag} in bag`,
    icon: mobIcon(d.mob),
    onClick: () => {
      const n = depositHeads(player, d.mob).get(d.mob) ?? 0;
      if (!n) return reopen(`§cYou have no Enchanted ${name} Heads.`);
      success(player, `Added ${n} ${name} heads to your head balance.`);
      return reopen(`§aAdded §f${n} §a${name} heads.`);
    },
  });
  if (manage) {
    tiles.push({
      text: "§e§lADD STACK",
      sub: "§7From inventory",
      icon: ICON.shop,
      onClick: () => {
        const n = addFromInventory(player, key);
        if (!n) return reopen(`§cNo level ${d.level} ${name} spawners in your inventory (or it's full).`);
        success(player, `Added ${n} spawners - now x${spawners.get(key)?.stack}.`);
        return reopen(`§aAdded §f${n} §aspawners.`);
      },
    });
    tiles.push({ text: "§c§lPICK UP", sub: "§7Back to inventory", icon: ICON.cancel, onClick: () => pickUp(player, key) });
  }
  tiles.push({ text: "§7§lCLOSE", sub: "§7Close menu", icon: ICON.back });
  await tileMenu(player, {
    title: `${name.toUpperCase()} SPAWNER`,
    theme: "red",
    body: lines.join("\n") + (manage ? "" : `\n§8Only ${d.ownerName ?? "the owner"} can upgrade or pick this up.`),
    tiles,
  });
}

// ---- spawning ---------------------------------------------------------------
const MOB_TAG = "eco_spawner_mob";
const stackOf = (e) => Number(e.getDynamicProperty("eco:stack") ?? 1);
const capStack = (n) => (S.maxMobStack > 0 ? Math.min(S.maxMobStack, n) : n);
const isFull = (e) => S.maxMobStack > 0 && stackOf(e) >= S.maxMobStack;

function setStack(e, mob, n) {
  e.setDynamicProperty("eco:stack", n);
  e.nameTag = S.stackMobs ? `§e${mobName(mob)} §fx${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` : `§e${mobName(mob)}`;
}

function freeze(e) {
  if (!S.freezeMobs) return;
  try {
    if (!e.getEffect("slowness")) e.addEffect("slowness", 20000000, { amplifier: 255, showParticles: false });
    if (!e.getEffect("fire_resistance")) e.addEffect("fire_resistance", 20000000, { amplifier: 0, showParticles: false });
  } catch {}
}

function tagMob(e, key, mob, n, anchor) {
  e.setDynamicProperty("eco:sp", key);
  e.setDynamicProperty("eco:mob", mob);
  const a = anchor ?? e.location;
  e.setDynamicProperty("eco:anchor", JSON.stringify({ x: a.x, y: a.y, z: a.z }));
  try {
    e.addTag(MOB_TAG);
  } catch {}
  setStack(e, mob, n);
  freeze(e);
}

/** Keeps every spawner mob standing on its spot. */
function holdMobs() {
  if (!S.freezeMobs || !spawners.size) return;
  const dims = new Set([...spawners.values()].map((d) => d.dim));
  for (const id of dims) {
    let list;
    try {
      list = world.getDimension(id).getEntities({ tags: [MOB_TAG] });
    } catch {
      continue;
    }
    for (const e of list) {
      try {
        const raw = e.getDynamicProperty("eco:anchor");
        if (typeof raw !== "string") continue;
        const a = JSON.parse(raw);
        const l = e.location;
        if (Math.abs(l.x - a.x) > 0.2 || Math.abs(l.z - a.z) > 0.2 || Math.abs(l.y - a.y) > 0.6) {
          e.teleport(a, { rotation: e.getRotation() });
        }
        freeze(e);
      } catch {}
    }
  }
}

// Slimes & magma cubes split when they die. Spawner ones spawn at the size
// that drops loot without splitting into loot-less pieces (small slime,
// medium magma cube), and any split pieces next to a stack are removed.
const SIZE_EVENT = { "minecraft:slime": "spawn_small", "minecraft:magma_cube": "spawn_medium" };
const SIZE_VALUE = { "minecraft:slime": 1, "minecraft:magma_cube": 2 };
const recentSplits = []; // where stacked slimes/magma cubes just died

function spawnMob(dim, type, loc) {
  const event = SIZE_EVENT[type];
  if (!event) return dim.spawnEntity(type, loc);
  let e;
  try {
    e = dim.spawnEntity(type, loc, { spawnEvent: event });
  } catch {
    e = dim.spawnEntity(type, loc);
  }
  try {
    if (e.getComponent("minecraft:variant")?.value === SIZE_VALUE[type]) return e;
  } catch {}
  // older versions: /summon supports spawn events
  try {
    e.remove();
    dim.runCommand(`summon ${type} ${loc.x} ${loc.y} ${loc.z} 0 0 ${event}`);
    const found = dim
      .getEntities({ type, location: loc, maxDistance: 1.5 })
      .find((x) => x.getDynamicProperty("eco:sp") === undefined);
    if (found) return found;
  } catch {}
  return dim.spawnEntity(type, loc);
}

function findSpot(dim, d) {
  for (let i = 0; i < 8; i++) {
    const x = d.x + Math.floor(Math.random() * 5) - 2;
    const z = d.z + Math.floor(Math.random() * 5) - 2;
    for (const y of [d.y, d.y + 1, d.y - 1]) {
      try {
        const b = dim.getBlock({ x, y, z });
        const up = dim.getBlock({ x, y: y + 1, z });
        const below = dim.getBlock({ x, y: y - 1, z });
        if (b?.isAir && up?.isAir && below && !below.isAir) return { x: x + 0.5, y, z: z + 0.5 };
      } catch {}
    }
  }
  return { x: d.x + 0.5, y: d.y + 1, z: d.z + 0.5 };
}

function spawnFor(dim, key, d, count) {
  const type = entityType(d.mob);
  const center = { x: d.x + 0.5, y: d.y + 0.5, z: d.z + 0.5 };
  const near = dim
    .getEntities({ type, location: center, maxDistance: S.mergeRadius })
    .filter((e) => e.getDynamicProperty("eco:sp") === key);

  if (S.stackMobs) {
    const target = near.find((e) => !isFull(e));
    if (target) {
      if (!target.hasTag(MOB_TAG)) tagMob(target, key, d.mob, stackOf(target)); // mob from an older version
      setStack(target, d.mob, capStack(stackOf(target) + count));
      return;
    }
    if (near.length) return; // full stack nearby
    const spot = findSpot(dim, d);
    tagMob(spawnMob(dim, type, spot), key, d.mob, capStack(count), spot);
    return;
  }
  const room = Math.min(count, S.maxLooseMobs - near.length);
  for (let i = 0; i < room; i++) {
    const spot = findSpot(dim, d);
    tagMob(spawnMob(dim, type, spot), key, d.mob, 1, spot);
  }
}

function tick() {
  const players = world.getAllPlayers();
  const r2 = S.activationRange * S.activationRange;
  for (const [key, d] of spawners) {
    const active = players.some((p) => {
      if (p.dimension.id !== d.dim) return false;
      const l = p.location;
      return (l.x - d.x) ** 2 + (l.y - d.y) ** 2 + (l.z - d.z) ** 2 <= r2;
    });
    if (!active) continue;
    let dim, block;
    try {
      dim = world.getDimension(d.dim);
      block = dim.getBlock(d);
    } catch {
      continue;
    }
    if (!block) continue; // chunk not loaded
    if (block.typeId !== SPAWNER_BLOCK) {
      forget(key); // removed by a command, /fill, etc.
      continue;
    }
    if (d.legacy) {
      // old (pre-v1.0.9) spawner: swap in the display-only version
      try {
        world.structureManager.place(`eco:spawner_${d.mob}`, dim, d);
      } catch {}
      d.legacy = false;
      save(key, d);
    }
    d.timer = (d.timer ?? 0) + 1;
    if (d.timer < levelInfo(d.level).interval) continue;
    d.timer = 0;
    try {
      spawnFor(dim, key, d, d.stack * S.mobsPerSpawn);
    } catch (e) {
      console.warn(`[eco] spawner ${key}: ${e}`);
    }
  }
}

// ---- events ---------------------------------------------------------------------
export function registerSpawners() {
  world.afterEvents.worldLoad.subscribe(() => {
    loadAll();
    system.runInterval(tick, 20);
    system.runInterval(holdMobs, 5);
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const { player, block, itemStack } = ev;
    const info = spawnerFromItem(itemStack);
    if (block.typeId === SPAWNER_BLOCK) {
      const key = keyOf(block.dimension.id, block.location);
      if (spawners.has(key)) {
        const d = spawners.get(key);
        if (info && info.mob === d.mob) {
          ev.cancel = true;
          if (ev.isFirstEvent) system.run(() => addToStack(player, key, info, player.isSneaking));
          return;
        }
        if (player.isSneaking && !info) {
          ev.cancel = true;
          if (ev.isFirstEvent) system.run(() => spawnerMenu(player, key).catch((e) => console.warn("[eco] " + e)));
          return;
        }
      }
    }
    if (!info) return;
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const face = ev.blockFace;
    system.run(() => placeSpawner(player, block, face, info));
  });

  // spawners can't be mined - pick them up from the spawner menu
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (ev.block.typeId !== SPAWNER_BLOCK) return;
    if (!spawners.has(keyOf(ev.block.dimension.id, ev.block.location))) return;
    ev.cancel = true;
    const p = ev.player;
    system.run(() => p.sendMessage("§7Spawners can't be mined. §fSneak and tap it §7and press §cPICK UP§7."));
  });

  // ...or blown up
  world.beforeEvents.explosion.subscribe((ev) => {
    const blocks = ev.getImpactedBlocks();
    const keep = blocks.filter((b) => !(b.typeId === SPAWNER_BLOCK && spawners.has(keyOf(b.dimension.id, b.location))));
    if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
  });

  // remove the pieces a stacked slime / magma cube splits into
  world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    try {
      if (!SIZE_EVENT[entity.typeId] || entity.getDynamicProperty("eco:sp")) return;
      const now = system.currentTick;
      const l = entity.location;
      const split = recentSplits.some(
        (r) => r.type === entity.typeId && r.dim === entity.dimension.id && now - r.tick <= 40 &&
          (r.x - l.x) ** 2 + (r.y - l.y) ** 2 + (r.z - l.z) ** 2 <= 9
      );
      if (split) entity.remove();
    } catch {}
  });

  // stacked mobs: killing one leaves the rest; maybe drop an enchanted head
  world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
    let key, mob, stack, loc, dim, type, anchor;
    try {
      key = deadEntity.getDynamicProperty("eco:sp");
      if (typeof key !== "string") return;
      mob = String(deadEntity.getDynamicProperty("eco:mob"));
      stack = stackOf(deadEntity);
      loc = deadEntity.location;
      dim = deadEntity.dimension;
      type = deadEntity.typeId;
      const raw = deadEntity.getDynamicProperty("eco:anchor");
      anchor = typeof raw === "string" ? JSON.parse(raw) : loc;
    } catch {
      return;
    }
    if (SIZE_EVENT[type]) {
      recentSplits.push({ type, dim: dim.id, x: loc.x, y: loc.y, z: loc.z, tick: system.currentTick });
      if (recentSplits.length > 50) recentSplits.shift();
    }
    const d = spawners.get(key);
    const killer = damageSource?.damagingEntity;
    const bonus = killer?.typeId === "minecraft:player" ? headChanceBonus(killer) : 0;
    if (d && Math.random() * 100 < levelInfo(d.level).headChance + bonus) {
      try {
        dim.spawnItem(new ItemStack(headItemId(mob), 1), loc);
      } catch {}
    }
    if (S.stackMobs && stack > 1) {
      try {
        tagMob(spawnMob(dim, type, anchor), key, mob, stack - 1, anchor);
      } catch {}
    }
  });
}
