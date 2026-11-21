import { BlockPermutation, EnchantmentTypes, ItemStack, system, world } from "@minecraft/server";
import { COLLECTION_TIERS, CROPS, MOB_DROPS, SKILL_TOOLS, SPAWNERS, TOOL_LEVELS } from "./config.js";
import { addMoney, fmt } from "./economy.js";
import { backTile, tileMenu, withNav } from "./ui.js";

// ============================================================================
//  SKILL TOOLS & COLLECTIONS
//  - Farming Hoe / Slayer Sword: gain XP when used, level up automatically.
//    Levels above TOOL_LEVELS.freeLevels also need a total collection.
//    Level + XP live in a hidden lore line:  §8eco:tool:<kind>:<level>:<xp>
//  - Collections: per player, per crop / mob. Tiers pay money once and give a
//    permanent bonus drop chance for that crop / mob.
// ============================================================================

const TAG = "§8eco:tool:";
const MAX_LEVEL = () => TOOL_LEVELS.xpNeeded.length;
const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const mobKey = (typeId) => typeId.replace(/^minecraft:/, "");
const mobInfo = (key) => SPAWNERS.find((s) => s.mob === key);
const placed = new Set(); // player-placed melons/pumpkins/cane/cactus (don't count)
const posKey = (dimId, l) => `${dimId}:${l.x},${l.y},${l.z}`;

// ---- collections -----------------------------------------------------------
export const colKey = (kind, id) => `eco:col:${kind}:${id}`;
export const getCol = (player, kind, id) => Number(player.getDynamicProperty(colKey(kind, id)) ?? 0);
export const tierOf = (n) => COLLECTION_TIERS.amounts.filter((a) => n >= a).length;

function addCol(player, kind, id, name, n = 1) {
  const before = getCol(player, kind, id);
  const after = before + n;
  player.setDynamicProperty(colKey(kind, id), after);
  const t0 = tierOf(before), t1 = tierOf(after);
  for (let t = t0 + 1; t <= t1; t++) {
    const reward = COLLECTION_TIERS.rewards[t - 1] ?? 0;
    if (reward) addMoney(player, reward);
    player.sendMessage(
      `§6§l✦ COLLECTION ✦ §r§f${name} §6${roman(t)}§7 reached! ` +
        `§a+${fmt(reward)}§7, §a+${COLLECTION_TIERS.bonusPerTier}% §7bonus ${name} drops`
    );
    player.playSound("random.levelup");
  }
}

/** Total of all crop collections ("farming") or all mob collections ("slayer"). */
export function collectionTotal(player, kind) {
  if (kind === "farming") return CROPS.reduce((n, c) => n + getCol(player, "crop", c.id), 0);
  return SPAWNERS.reduce((n, s) => n + getCol(player, "mob", s.mob), 0);
}

const roman = (n) => ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] ?? String(n);

// ---- tools ------------------------------------------------------------------
export function readTool(item) {
  if (!item) return undefined;
  const line = item.getLore().find((l) => l.startsWith(TAG));
  if (!line) return undefined;
  const [kind, lvl, xp] = line.slice(TAG.length).split(":");
  if (!SKILL_TOOLS[kind]) return undefined;
  return { kind, level: Math.max(1, Number(lvl) || 1), xp: Math.max(0, Number(xp) || 0) };
}

/** Highest level the player's collection allows for this tool. */
export function levelCap(player, kind) {
  const total = collectionTotal(player, kind);
  let cap = 1;
  for (let l = 1; l <= MAX_LEVEL(); l++) {
    if (l <= TOOL_LEVELS.freeLevels || total >= (TOOL_LEVELS.collectionNeeded[l - 1] ?? 0)) cap = l;
    else break;
  }
  return cap;
}

function levelFromXp(xp) {
  let lvl = 1;
  for (let l = 1; l <= MAX_LEVEL(); l++) if (xp >= TOOL_LEVELS.xpNeeded[l - 1]) lvl = l;
  return lvl;
}

function bar(cur, next) {
  const filled = next > 0 ? Math.max(0, Math.min(10, Math.floor((cur / next) * 10))) : 10;
  return "§a" + "|".repeat(filled) + "§8" + "|".repeat(10 - filled);
}

function writeTool(stack, kind, level, xp, player) {
  const t = SKILL_TOOLS[kind];
  const next = TOOL_LEVELS.xpNeeded[level];
  const lore = [`§7Level: §e${level}§7/§e${MAX_LEVEL()}`];
  if (next === undefined) lore.push(`§7XP: §b${commas(xp)} §6MAX`);
  else if (xp >= next) lore.push(`§7XP: §b${commas(xp)} §6READY TO LEVEL UP`);
  else lore.push(`§7XP: §b${commas(xp)}§7/§b${commas(next)} ${bar(xp, next)}`);
  lore.push(`§7Bonus drops: §a+${level * t.bonusPerLevel}%`);
  if (kind === "farming") lore.push(`§7Auto-replant: ${level >= t.replantLevel ? "§aYes" : `§cLv ${t.replantLevel}`}`);
  if (kind === "slayer") lore.push(`§7Head chance: §d+${level * t.headBonusPerLevel}%`);
  if (player && next !== undefined && levelFromXp(xp) > level) {
    const need = TOOL_LEVELS.collectionNeeded[level] ?? 0;
    lore.push(`§cLv ${level + 1} needs ${commas(need)} ${kind === "farming" ? "crops" : "kills"}`);
  }
  lore.push(`${TAG}${kind}:${level}:${xp}`);
  stack.setLore(lore);
  stack.nameTag = `§r§6${t.name} §e[Lv ${level}]`;
  try {
    const dur = stack.getComponent("minecraft:durability");
    if (dur) dur.damage = 0; // never breaks
  } catch {}
  if (kind === "slayer") {
    try {
      const ench = stack.getComponent("minecraft:enchantable");
      const sharp = Math.min(5, Math.floor(level / 2));
      const type = EnchantmentTypes.get("sharpness");
      if (ench && type) {
        try {
          ench.removeEnchantment(type);
        } catch {}
        if (sharp > 0) ench.addEnchantment({ type, level: sharp });
      }
    } catch {}
  }
}

export function makeTool(kind, player) {
  const stack = new ItemStack(SKILL_TOOLS[kind].item, 1);
  stack.keepOnDeath = true;
  writeTool(stack, kind, 1, 0, player);
  return stack;
}

function heldTool(player, kind) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const slot = player.selectedSlotIndex;
  const item = inv?.getItem(slot);
  const t = readTool(item);
  return t && t.kind === kind ? { ...t, item, inv, slot } : undefined;
}

function addToolXp(player, held) {
  const kind = held.kind;
  const xp = held.xp + SKILL_TOOLS[kind].xpPerUse;
  const target = Math.min(levelFromXp(xp), levelCap(player, kind));
  const level = Math.max(held.level, target);
  writeTool(held.item, kind, level, xp, player);
  held.inv.setItem(held.slot, held.item);
  if (level > held.level) {
    player.sendMessage(`§6§l⬆ LEVEL UP! §r§6${SKILL_TOOLS[kind].name} §7is now §eLevel ${level}§7!`);
    player.playSound("random.levelup");
  }
  return level;
}

/** Extra enchanted-head % for spawner mobs (used by spawners.js). */
export function headChanceBonus(player) {
  try {
    const held = heldTool(player, "slayer");
    return held ? held.level * SKILL_TOOLS.slayer.headBonusPerLevel : 0;
  } catch {
    return 0;
  }
}

/** Number of extra drops for a bonus chance in % (100% = 1 guaranteed, 150% = 1 + 50% chance of 2) */
function rollExtra(pct) {
  let n = Math.floor(pct / 100);
  if (Math.random() * 100 < pct % 100) n++;
  return n;
}

// ---- events ------------------------------------------------------------------
export function registerTools() {
  const tracked = new Set(CROPS.filter((c) => c.grown).map((c) => c.block));

  world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
    if (tracked.has(block.typeId)) placed.add(posKey(block.dimension.id, block.location));
  });

  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    const perm = ev.brokenBlockPermutation;
    const crop = CROPS.find((c) => c.block === perm.type.id);
    if (!crop) return;
    const key = posKey(ev.dimension.id, ev.block.location);
    if (crop.grown) {
      if (placed.delete(key)) return; // placed by a player - doesn't count
    } else {
      try {
        if (perm.getState(crop.mature[0]) !== crop.mature[1]) return; // not fully grown
      } catch {}
    }
    const player = ev.player;
    addCol(player, "crop", crop.id, crop.name);
    const held = heldTool(player, "farming");
    let level = 0;
    if (held) level = addToolXp(player, held);
    const pct = level * SKILL_TOOLS.farming.bonusPerLevel + tierOf(getCol(player, "crop", crop.id)) * COLLECTION_TIERS.bonusPerTier;
    const extra = rollExtra(pct);
    const at = { x: ev.block.x + 0.5, y: ev.block.y + 0.5, z: ev.block.z + 0.5 };
    if (extra > 0) {
      try {
        ev.dimension.spawnItem(new ItemStack(crop.drop, extra), at);
      } catch {}
    }
    // auto-replant (crops that grow in stages only)
    if (held && !crop.grown && level >= SKILL_TOOLS.farming.replantLevel) {
      const dim = ev.dimension, loc = ev.block.location;
      system.run(() => {
        try {
          const b = dim.getBlock(loc);
          if (b?.isAir) b.setPermutation(perm.withState(crop.mature[0], 0));
        } catch {
          try {
            dim.getBlock(loc)?.setPermutation(BlockPermutation.resolve(crop.block));
          } catch {}
        }
      });
    }
  });

  world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
    const killer = damageSource?.damagingEntity;
    if (killer?.typeId !== "minecraft:player") return;
    let key, at, dim;
    try {
      key = mobKey(deadEntity.typeId);
      at = deadEntity.location;
      dim = deadEntity.dimension;
    } catch {
      return;
    }
    const info = mobInfo(key);
    if (!info) return;
    addCol(killer, "mob", key, info.name);
    const held = heldTool(killer, "slayer");
    let level = 0;
    if (held) level = addToolXp(killer, held);
    const pct = level * SKILL_TOOLS.slayer.bonusPerLevel + tierOf(getCol(killer, "mob", key)) * COLLECTION_TIERS.bonusPerTier;
    const sets = rollExtra(pct);
    for (let s = 0; s < sets; s++) {
      for (const [item, min, max] of MOB_DROPS[key] ?? []) {
        const n = min + Math.floor(Math.random() * (max - min + 1));
        if (n > 0) {
          try {
            dim.spawnItem(new ItemStack(item, n), at);
          } catch {}
        }
      }
    }
  });
}

// ---- menus --------------------------------------------------------------------
export async function collectionsMenu(player, back) {
  const reopen = () => collectionsMenu(player, back);
  const farm = collectionTotal(player, "farming");
  const combat = collectionTotal(player, "slayer");
  await tileMenu(player, {
    title: "COLLECTIONS",
    theme: "gold",
    body:
      `§7Harvest crops and kill mobs to level up collections.\n` +
      `§7Each tier pays §amoney §7and gives §a+${COLLECTION_TIERS.bonusPerTier}% §7bonus drops.\n` +
      `§7Farming total: §e${commas(farm)}   §7Combat total: §c${commas(combat)}`,
    tiles: [
      { text: "§e§lFARMING", sub: `§7${commas(farm)} crops`, icon: "textures/ui/eco/icon_farming", onClick: () => colList(player, "crop", reopen) },
      { text: "§c§lCOMBAT", sub: `§7${commas(combat)} kills`, icon: "textures/ui/eco/icon_spawners", onClick: () => colList(player, "mob", reopen) },
      { text: "§6§lSKILL TOOLS", sub: "§7Levels & unlocks", icon: SKILL_TOOLS.farming.icon, onClick: () => toolsInfo(player, reopen) },
      backTile(back),
    ],
  });
}

function colList(player, kind, back) {
  const entries =
    kind === "crop"
      ? CROPS.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))
      : SPAWNERS.map((s) => ({ id: s.mob, name: s.name, icon: s.icon }));
  const reopen = () => colList(player, kind, back);
  const tiles = entries.map((e) => {
    const n = getCol(player, kind, e.id);
    const t = tierOf(n);
    return {
      text: `§f${e.name.length > 17 ? e.name.slice(0, 16) + "…" : e.name}`,
      sub: `${t ? `§6${roman(t)} ` : ""}§7${commas(n)}`,
      icon: e.icon,
      onClick: () => colDetail(player, kind, e, reopen),
    };
  });
  return tileMenu(player, {
    title: kind === "crop" ? "FARMING COLLECTIONS" : "COMBAT COLLECTIONS",
    theme: kind === "crop" ? "green" : "red",
    body: `§7Tap one to see its tiers and rewards.`,
    tiles: withNav(tiles, { back }),
  });
}

function colDetail(player, kind, e, back) {
  const n = getCol(player, kind, e.id);
  const t = tierOf(n);
  const lines = COLLECTION_TIERS.amounts.map((a, i) => {
    const done = n >= a;
    return `${done ? "§a✔" : "§8✘"} §f${roman(i + 1)} §7- ${commas(a)}  §a${fmt(COLLECTION_TIERS.rewards[i])} §7+ §a${COLLECTION_TIERS.bonusPerTier}% drops`;
  });
  const next = COLLECTION_TIERS.amounts[t];
  return tileMenu(player, {
    title: `${e.name.toUpperCase()} COLLECTION`,
    theme: kind === "crop" ? "green" : "red",
    body:
      `§f${e.name}: §e${commas(n)} ${kind === "crop" ? "harvested" : "killed"}   §7Tier §6${t ? roman(t) : "-"}\n` +
      `§7Bonus drop chance: §a+${t * COLLECTION_TIERS.bonusPerTier}%` +
      (next ? `   §7Next tier at §f${commas(next)}` : "   §6All tiers done!") +
      "\n" + lines.join("\n"),
    tiles: [backTile(back)],
  });
}

function toolsInfo(player, back) {
  const fmtLevels = (kind) => {
    const total = collectionTotal(player, kind);
    return TOOL_LEVELS.collectionNeeded
      .map((need, i) => {
        const lvl = i + 1;
        if (lvl <= TOOL_LEVELS.freeLevels) return null;
        return `${total >= need ? "§a✔" : "§8✘"} §fLv ${lvl}§7: ${commas(need)}`;
      })
      .filter(Boolean)
      .join("  ");
  };
  return tileMenu(player, {
    title: "SKILL TOOLS",
    theme: "gold",
    body:
      `§7Skill tools gain XP when used and level up automatically.\n` +
      `§7Levels 1-${TOOL_LEVELS.freeLevels} are free; higher levels also need a total collection:\n` +
      `§e${SKILL_TOOLS.farming.name} §7(crops ${commas(collectionTotal(player, "farming"))}): ${fmtLevels("farming")}\n` +
      `§c${SKILL_TOOLS.slayer.name} §7(kills ${commas(collectionTotal(player, "slayer"))}): ${fmtLevels("slayer")}\n` +
      `§8Buy them in Shop > Skill Tools.`,
    tiles: [backTile(back)],
  });
}

/** Shop tiles for buying skill tools (used by menus.js). */
export function skillToolTiles(player, buy) {
  return Object.entries(SKILL_TOOLS).map(([kind, t]) => ({
    text: `§6§l${t.name.toUpperCase()}`,
    sub: `§a${fmt(t.price)}`,
    icon: t.icon,
    onClick: () => buy(kind),
  }));
}

