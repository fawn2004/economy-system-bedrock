import { EnchantmentTypes, ItemLockMode, ItemStack } from "@minecraft/server";

export function container(player) {
  return player.getComponent("minecraft:inventory")?.container;
}

export function makeStack(typeId, amount = 1) {
  try {
    return new ItemStack(typeId, amount);
  } catch {
    return undefined;
  }
}

function isPlain(item) {
  return !item.nameTag && item.getLore().length === 0;
}

/** How many of `typeId` fit in the player's inventory right now. */
export function spaceFor(player, typeId) {
  const inv = container(player);
  const probe = makeStack(typeId);
  if (!inv || !probe) return 0;
  const max = probe.maxAmount;
  let space = 0;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!it) space += max;
    else if (it.isStackableWith(probe)) space += Math.max(0, max - it.amount);
  }
  return space;
}

export function freeSlots(player) {
  return container(player)?.emptySlotsCount ?? 0;
}

/** Gives `amount` items (split into stacks). Overflow is dropped at the player. */
export function giveItems(player, typeId, amount, decorate) {
  const inv = container(player);
  const probe = makeStack(typeId);
  if (!inv || !probe) return false;
  let left = amount;
  while (left > 0) {
    const n = Math.min(probe.maxAmount, left);
    const stack = new ItemStack(typeId, n);
    if (decorate) decorate(stack);
    const overflow = inv.addItem(stack);
    if (overflow) player.dimension.spawnItem(overflow, player.location);
    left -= n;
  }
  return true;
}

export function applyEnchants(stack, enchants) {
  if (!enchants) return;
  const ench = stack.getComponent("minecraft:enchantable");
  if (!ench) return;
  for (const [id, level] of Object.entries(enchants)) {
    try {
      const type = EnchantmentTypes.get(id);
      if (type) ench.addEnchantment({ type, level });
    } catch {
      // incompatible enchant for this item - skip it
    }
  }
}

/** Counts plain (un-renamed, no lore) items per type. */
export function countPlain(player) {
  const inv = container(player);
  const counts = new Map();
  if (!inv) return counts;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it && isPlain(it)) counts.set(it.typeId, (counts.get(it.typeId) ?? 0) + it.amount);
  }
  return counts;
}

/** Removes every plain stack of `typeId`. Returns how many items were removed. */
export function removeAllPlain(player, typeId) {
  const inv = container(player);
  if (!inv) return 0;
  let removed = 0;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it && it.typeId === typeId && isPlain(it)) {
      removed += it.amount;
      inv.setItem(i, undefined);
    }
  }
  return removed;
}

// ---- menu compass ----------------------------------------------------------
export const COMPASS_ID = "eco:menu_compass";

export function hasCompass(player) {
  const inv = container(player);
  if (!inv) return true;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === COMPASS_ID) return true;
  return false;
}

export function giveCompass(player, slot = 8) {
  const inv = container(player);
  if (!inv || hasCompass(player)) return;
  const stack = new ItemStack(COMPASS_ID, 1);
  stack.lockMode = ItemLockMode.inventory; // can't be dropped or put in chests
  stack.keepOnDeath = true;
  stack.setLore(["§7Use to open the §bSkyblock Menu"]);
  if (!inv.getItem(slot)) inv.setItem(slot, stack);
  else inv.addItem(stack);
}

/** Removes up to `amount` plain items of `typeId`. Returns how many were removed. */
export function removePlain(player, typeId, amount) {
  const inv = container(player);
  if (!inv || amount <= 0) return 0;
  let left = amount;
  for (let i = 0; i < inv.size && left > 0; i++) {
    const it = inv.getItem(i);
    if (!it || it.typeId !== typeId || !isPlain(it)) continue;
    if (it.amount <= left) {
      left -= it.amount;
      inv.setItem(i, undefined);
    } else {
      it.amount -= left;
      inv.setItem(i, it);
      left = 0;
    }
  }
  return amount - left;
}
