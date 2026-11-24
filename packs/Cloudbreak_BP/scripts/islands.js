import { BlockPermutation, BlockVolume, ItemStack, ItemTypes, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { allClans, clanOf, saveClan } from "./clans.js";

const I = CONFIG.island;
const overworld = () => world.getDimension("overworld");

// ---------------------------------------------------------------------------
// Grid: slot n -> island centre. Slots are never reused, so an old island is
// never handed to a new clan.
// ---------------------------------------------------------------------------

export function slotCentre(slot) {
  return {
    x: I.originX + (slot % I.columns) * I.spacing,
    y: I.y,
    z: I.originZ + Math.floor(slot / I.columns) * I.spacing,
  };
}

/** The grid slot a location falls in, or undefined outside the island area. */
export function slotAt(dimensionId, loc) {
  if (dimensionId !== "minecraft:overworld") return undefined;
  const col = Math.round((loc.x - I.originX) / I.spacing);
  const row = Math.round((loc.z - I.originZ) / I.spacing);
  if (col < 0 || col >= I.columns || row < 0) return undefined;
  return row * I.columns + col;
}

/** The clan whose island grid cell contains this location. */
export function clanAt(dimensionId, loc) {
  const slot = slotAt(dimensionId, loc);
  if (slot === undefined) return undefined;
  return allClans().find((c) => c.island?.slot === slot);
}

export function inBorder(clan, loc) {
  if (!clan?.island) return false;
  const half = clan.island.size / 2;
  return Math.abs(loc.x - clan.island.x - 0.5) <= half && Math.abs(loc.z - clan.island.z - 0.5) <= half;
}

export function inSpawnZone(clan, loc) {
  if (!clan?.island) return false;
  const r = I.spawnProtection;
  return Math.abs(Math.floor(loc.x) - clan.island.x) <= r && Math.abs(Math.floor(loc.z) - clan.island.z) <= r;
}

/** True when the location is anywhere inside the island grid (the void between islands too). */
export function inIslandArea(dimensionId, loc) {
  if (dimensionId !== "minecraft:overworld") return false;
  const half = I.spacing / 2;
  return loc.x >= I.originX - half && loc.z >= I.originZ - half && loc.x < I.originX + I.columns * I.spacing - half;
}

export const spawnLocation = (clan) => ({ x: clan.island.x + 0.5, y: clan.island.y + 1, z: clan.island.z + 0.5 });

// ---------------------------------------------------------------------------
// Island creation
// ---------------------------------------------------------------------------

function allocateSlot() {
  const slot = world.getDynamicProperty("cb:nextSlot") ?? 0;
  world.setDynamicProperty("cb:nextSlot", slot + 1);
  return slot;
}

/** Waits until the chunk at loc is loaded (the player has just been teleported there). */
async function waitForChunk(loc, ticks = 200) {
  for (let t = 0; t < ticks; t += 5) {
    try {
      const b = overworld().getBlock(loc);
      if (b?.isValid) return true;
    } catch {
      /* chunk not loaded yet */
    }
    await system.waitTicks(5);
  }
  return false;
}

function fill(x1, y1, z1, x2, y2, z2, block) {
  overworld().fillBlocks(new BlockVolume({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }), block);
}

function set(x, y, z, block) {
  overworld().getBlock({ x, y, z })?.setPermutation(BlockPermutation.resolve(block));
}

/** Builds the starter island: 15 x 15 top, a 9 x 9 stone-brick spawn zone, a tree and a chest. */
function buildStarter(c) {
  const { x, y, z } = c;
  // tapering underside
  fill(x - 1, y - 5, z - 1, x + 1, y - 5, z + 1, "minecraft:stone");
  fill(x - 3, y - 4, z - 3, x + 3, y - 4, z + 3, "minecraft:stone");
  fill(x - 5, y - 3, z - 5, x + 5, y - 3, z + 5, "minecraft:dirt");
  fill(x - 6, y - 2, z - 6, x + 6, y - 2, z + 6, "minecraft:dirt");
  fill(x - 7, y - 1, z - 7, x + 7, y - 1, z + 7, "minecraft:dirt");
  // top: grass with the protected spawn zone in stone bricks
  fill(x - 7, y, z - 7, x + 7, y, z + 7, "minecraft:grass_block");
  const r = I.spawnProtection;
  fill(x - r, y, z - r, x + r, y, z + r, "minecraft:stone_bricks");
  // tree, outside the spawn zone so it can be chopped
  const tx = x + 6, tz = z + 6;
  fill(tx - 2, y + 4, tz - 2, Math.min(tx + 2, x + 7), y + 5, Math.min(tz + 2, z + 7), "minecraft:oak_leaves");
  fill(tx - 1, y + 6, tz - 1, Math.min(tx + 1, x + 7), y + 6, Math.min(tz + 1, z + 7), "minecraft:oak_leaves");
  for (let i = 1; i <= 5; i++) set(tx, y + i, tz, "minecraft:oak_log");
  // starter chest, inside the spawn zone
  set(x - 2, y + 1, z + 2, "minecraft:chest");
  const inv = overworld().getBlock({ x: x - 2, y: y + 1, z: z + 2 })?.getComponent("minecraft:inventory")?.container;
  if (inv) {
    for (const [id, n] of [
      ["minecraft:lava_bucket", 1],
      ["minecraft:ice", 2],
      ["minecraft:oak_sapling", 2],
      ["minecraft:bone_meal", 8],
      ["minecraft:melon_seeds", 1],
      ["minecraft:pumpkin_seeds", 1],
      ["minecraft:bread", 8],
    ]) {
      if (ItemTypes.get(id)) inv.addItem(new ItemStack(id, n));
    }
  }
}

/** Gives a clan its island (if it has none), builds it and sends the player there. */
export async function createIsland(player, clan) {
  if (clan.island) return sendHome(player, clan);
  const slot = allocateSlot();
  const c = slotCentre(slot);
  clan.island = { slot, x: c.x, y: c.y, z: c.z, size: I.startSize };
  saveClan(clan);
  player.sendMessage(`${CONFIG.prefix}Building your island...`);
  // go there first so the chunk loads, and keep the player from falling meanwhile
  player.teleport({ x: c.x + 0.5, y: c.y + 3, z: c.z + 0.5 }, { dimension: overworld() });
  player.addEffect("slow_falling", 200, { showParticles: false });
  if (!(await waitForChunk(c))) {
    player.sendMessage(`${CONFIG.prefix}§cThe island area didn't load in time. Use §f/is§c to try again.`);
    clan.island.built = false;
    saveClan(clan);
    return;
  }
  buildStarter(c);
  clan.island.built = true;
  saveClan(clan);
  sendHome(player, clan);
}

export async function sendHome(player, clan = clanOf(player)) {
  if (!clan) {
    player.sendMessage(`${CONFIG.prefix}You are not in a clan. Create or join one from the menu.`);
    return;
  }
  if (!clan.island) return createIsland(player, clan);
  if (clan.island.built === false) {
    // a previous build didn't finish: go there and try again
    player.teleport({ x: clan.island.x + 0.5, y: clan.island.y + 3, z: clan.island.z + 0.5 }, { dimension: overworld() });
    player.addEffect("slow_falling", 200, { showParticles: false });
    if (!(await waitForChunk(clan.island))) return;
    buildStarter(clan.island);
    clan.island.built = true;
    saveClan(clan);
  }
  const dim = overworld();
  player.teleport(spawnLocation(clan), { dimension: dim });
  player.setSpawnPoint({ dimension: dim, ...spawnLocation(clan) });
  player.setDynamicProperty("cb:homeSet", true);
  player.sendMessage(`${CONFIG.prefix}Welcome home to §b${clan.name}§7's island.`);
}

/** Called when a player leaves or is removed from a clan. */
export function clearIslandSpawn(player) {
  try {
    player.setSpawnPoint(undefined);
  } catch {
    /* already default */
  }
}

// ---------------------------------------------------------------------------
// Protection
//   In the island area a player may only build on their own island, inside
//   its border. The 9 x 9 spawn zone can't be broken or built on, but chests
//   still open and spawners can still be picked up. Players tagged "admin"
//   are never blocked.
// ---------------------------------------------------------------------------

const FACE = {
  Up: [0, 1, 0],
  Down: [0, -1, 0],
  North: [0, 0, -1],
  South: [0, 0, 1],
  West: [-1, 0, 0],
  East: [1, 0, 0],
};

const SPAWNER = "minecraft:mob_spawner";

function isContainer(block) {
  try {
    return !!block.getComponent("minecraft:inventory");
  } catch {
    return false;
  }
}

/** Why a player may not change the block at loc, or undefined if they may. */
function buildDenied(player, dimensionId, loc, { breaking = false, blockType } = {}) {
  if (player.hasTag("admin")) return undefined;
  if (!inIslandArea(dimensionId, loc)) return undefined;
  const own = clanOf(player);
  const here = clanAt(dimensionId, loc);
  if (!own || here?.id !== own.id) return "You can only build on your own island.";
  if (!inBorder(own, loc)) return "That's outside your island border.";
  if (inSpawnZone(own, loc) && !(breaking && blockType === SPAWNER)) return "The spawn zone is protected.";
  return undefined;
}

const lastWarn = new Map();
function warn(player, msg) {
  const now = Date.now();
  if ((lastWarn.get(player.id) ?? 0) + 1500 > now) return;
  lastWarn.set(player.id, now);
  system.run(() => player.isValid && player.onScreenDisplay.setActionBar(`§c${msg}`));
}

export function registerProtection() {
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const why = buildDenied(ev.player, ev.dimension.id, ev.block.location, { breaking: true, blockType: ev.block.typeId });
    if (why) {
      ev.cancel = true;
      warn(ev.player, why);
    }
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const { player, block, itemStack } = ev;
    if (player.hasTag("admin")) return;
    const dimId = block.dimension.id;
    if (!inIslandArea(dimId, block.location)) return;
    // Opening chests and other containers is always allowed on your own island,
    // and inside the spawn zone (loot stays at risk during raids).
    if (isContainer(block) && !player.isSneaking) {
      const own = clanOf(player);
      if (own && clanAt(dimId, block.location)?.id === own.id) return;
    }
    const own = clanOf(player);
    if (!own || clanAt(dimId, block.location)?.id !== own.id) {
      ev.cancel = true;
      warn(player, "You can only build on your own island.");
      return;
    }
    // Using an item can place a block on the clicked face: check that spot.
    if (!itemStack) return;
    const [dx, dy, dz] = FACE[ev.blockFace] ?? [0, 0, 0];
    const target = { x: block.location.x + dx, y: block.location.y + dy, z: block.location.z + dz };
    const why = buildDenied(player, dimId, target) ?? (inSpawnZone(own, block.location) ? "The spawn zone is protected." : undefined);
    if (why) {
      ev.cancel = true;
      warn(player, why);
    }
  });

  world.beforeEvents.explosion.subscribe((ev) => {
    const blocks = ev.getImpactedBlocks();
    const keep = blocks.filter((b) => {
      if (!inIslandArea(b.dimension.id, b.location)) return true;
      const clan = clanAt(b.dimension.id, b.location);
      return !(clan && inSpawnZone(clan, b.location));
    });
    if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
  });
}
