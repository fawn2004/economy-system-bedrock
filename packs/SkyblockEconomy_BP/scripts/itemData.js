import { EnchantmentTypes, ItemLockMode, ItemStack } from "@minecraft/server";
import { getCatalog } from "./catalog.js";
import { isMinionLoot, lootIcon } from "./minions.js";

// ============================================================================
//  ITEM DATA
//  Turns an ItemStack into plain JSON (and back) so it can be stored in the
//  world, e.g. for the Auction House. Every custom item in this add-on keeps
//  its data in its name and lore, so type + amount + name + lore +
//  enchantments + damage is enough to rebuild it exactly.
// ============================================================================

const pretty = (id) =>
  id
    .replace(/^[a-z_]+:/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Items that can't be traded (menu compass, locked items). */
export function canTrade(item) {
  if (!item) return false;
  if (item.typeId === "eco:menu_compass") return false;
  if (item.lockMode && item.lockMode !== ItemLockMode.none) return false;
  if (item.getLore().some((l) => l.includes("Kit item"))) return false;
  return true;
}

export function serializeItem(item) {
  const d = { id: item.typeId, n: item.amount };
  if (item.nameTag) d.name = item.nameTag;
  const lore = item.getLore();
  if (lore.length) d.lore = lore;
  if (item.keepOnDeath) d.keep = true;
  try {
    const ench = item.getComponent("minecraft:enchantable");
    const list = ench?.getEnchantments() ?? [];
    if (list.length) d.ench = list.map((e) => [e.type.id, e.level]);
  } catch {}
  try {
    const dur = item.getComponent("minecraft:durability");
    if (dur?.damage) d.dmg = dur.damage;
  } catch {}
  return d;
}

export function deserializeItem(d) {
  const stack = new ItemStack(d.id, 1);
  stack.amount = Math.max(1, Math.min(stack.maxAmount, d.n ?? 1));
  if (d.name) stack.nameTag = d.name;
  if (d.lore) stack.setLore(d.lore);
  if (d.keep) stack.keepOnDeath = true;
  if (d.ench) {
    const ench = stack.getComponent("minecraft:enchantable");
    for (const [id, level] of d.ench) {
      try {
        const type = EnchantmentTypes.get(id);
        if (type && ench) ench.addEnchantment({ type, level });
      } catch {}
    }
  }
  if (d.dmg) {
    try {
      const dur = stack.getComponent("minecraft:durability");
      if (dur) dur.damage = Math.min(dur.maxDurability, d.dmg);
    } catch {}
  }
  return stack;
}

/** Display name of stored item data (custom name without colour codes, or the item name). */
export function itemDataName(d) {
  const custom = d.name?.replace(/§./g, "").trim();
  return custom || pretty(d.id);
}

/** Vanilla-style icon path for an item id (best guess - fine for most items). */
export function itemIcon(id) {
  const known = getCatalog().all.get(id)?.icon;
  if (known) return known;
  if (isMinionLoot(id)) return lootIcon(id);
  if (id === "minecraft:mob_spawner") return "textures/ui/eco/icon_spawners";
  if (id === "eco:mining_minion") return "textures/ui/eco/icon_minion";
  const short = id.replace(/^minecraft:/, "");
  if (id.startsWith("minecraft:")) return `textures/items/${short}`;
  return "textures/ui/eco/icon_coin";
}

/** Short description lines of stored item data: enchantments and lore. */
export function itemDataLines(d) {
  const lines = [];
  for (const [id, lvl] of d.ench ?? []) lines.push(`§9${pretty(id)} ${roman(lvl)}`);
  for (const l of d.lore ?? []) if (!l.startsWith("§8eco:")) lines.push(l);
  return lines;
}

export const roman = (n) => ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] ?? String(n);
