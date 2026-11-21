import { ItemStack, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { container } from "./inventory.js";

// Shop spawners are normal mob spawner items tagged with hidden lore. When one
// is placed we cancel the vanilla placement and load a structure containing a
// spawner already set to the right mob (structures/eco/spawner_<mob>.mcstructure).

const TAG_PREFIX = "§8eco:spawner:";
const REPLACEABLE = new Set([
  "minecraft:air",
  "minecraft:short_grass",
  "minecraft:tall_grass",
  "minecraft:fern",
  "minecraft:large_fern",
  "minecraft:snow_layer",
  "minecraft:water",
  "minecraft:flowing_water",
  "minecraft:lava",
  "minecraft:flowing_lava",
  "minecraft:deadbush",
  "minecraft:vine",
]);
const FACE = {
  Up: { x: 0, y: 1, z: 0 },
  Down: { x: 0, y: -1, z: 0 },
  North: { x: 0, y: 0, z: -1 },
  South: { x: 0, y: 0, z: 1 },
  East: { x: 1, y: 0, z: 0 },
  West: { x: -1, y: 0, z: 0 },
};

const prettyMob = (mob) => mob.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function makeSpawnerItem(mob, amount = 1) {
  const stack = new ItemStack("minecraft:mob_spawner", amount);
  stack.nameTag = `§r§d${prettyMob(mob)} Spawner`;
  stack.setLore([`§7Mob: §f${prettyMob(mob)}`, "§7Place it to start spawning", TAG_PREFIX + mob]);
  return stack;
}

function mobFromItem(item) {
  if (item?.typeId !== "minecraft:mob_spawner") return undefined;
  const line = item.getLore().find((l) => l.startsWith(TAG_PREFIX));
  return line ? line.slice(TAG_PREFIX.length) : undefined;
}

const key = (dim, l) => `eco:sp:${dim.id}:${l.x},${l.y},${l.z}`;

function isCreative(player) {
  return String(player.getGameMode()).toLowerCase() === "creative";
}

function place(player, block, face, mob) {
  const target = REPLACEABLE.has(block.typeId) ? block : block.offset(FACE[face] ?? FACE.Up);
  if (!target || !REPLACEABLE.has(target.typeId)) return;

  // don't place inside the player
  const p = player.location;
  const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
  if (target.x === px && target.z === pz && (target.y === py || target.y === py + 1)) return;

  const loc = target.location;
  try {
    world.structureManager.place(`eco:spawner_${mob}`, player.dimension, loc);
  } catch {
    player.sendMessage(`§cMissing spawner structure for "${mob}" - tell an admin.`);
    return;
  }
  world.setDynamicProperty(key(player.dimension, loc), mob);
  player.playSound("dig.stone");

  if (!isCreative(player)) {
    const inv = container(player);
    const slot = player.selectedSlotIndex;
    const held = inv?.getItem(slot);
    if (held && mobFromItem(held) === mob) {
      if (held.amount > 1) {
        held.amount -= 1;
        inv.setItem(slot, held);
      } else inv.setItem(slot, undefined);
    }
  }
}

export function registerSpawners() {
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const mob = mobFromItem(ev.itemStack);
    if (!mob) return;
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const { player, block, blockFace } = ev;
    system.run(() => place(player, block, blockFace, mob));
  });

  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    if (ev.brokenBlockPermutation.type.id !== "minecraft:mob_spawner") return;
    const k = key(ev.dimension, ev.block.location);
    const mob = world.getDynamicProperty(k);
    if (typeof mob !== "string") return;
    world.setDynamicProperty(k, undefined);

    let silk = false;
    try {
      silk = !!ev.itemStackBeforeBreak?.getComponent("minecraft:enchantable")?.getEnchantment("silk_touch");
    } catch {}
    if (CONFIG.spawners.requireSilkTouch && !silk) {
      ev.player.sendMessage("§7The spawner broke. §8(Use Silk Touch to pick spawners up)");
      return;
    }
    const center = { x: ev.block.x + 0.5, y: ev.block.y + 0.5, z: ev.block.z + 0.5 };
    ev.dimension.spawnItem(makeSpawnerItem(mob), center);
  });
}
