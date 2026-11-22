import { fmt, fmtShort, takeMoney } from "./economy.js";
import { container, freeSlots } from "./inventory.js";
import { deserializeItem, itemIcon, serializeItem } from "./itemData.js";
import { RARITIES, STATS, itemStats, readItem } from "./items.js";
import { invalidate, statSources } from "./stats.js";
import { ICON, backTile, fail, pagedMenu, success } from "./ui.js";

// ============================================================================
//  ACCESSORY BAG
//  Accessories (charms, rings, artifacts...) give stats while they're in your
//  bag. Only the best one of each family counts (a Swift Ring and a Swift
//  Artifact don't stack). The bag starts with 9 slots and can be upgraded.
//  Player data: eco:acc = [item data], eco:accSize = slots
// ============================================================================

const SIZES = [9, 18, 27, 36, 45];
const COSTS = [50000, 250000, 1000000, 5000000];

const bag = (player) => {
  try {
    return JSON.parse(String(player.getDynamicProperty("eco:acc") ?? "[]"));
  } catch {
    return [];
  }
};
const saveBag = (player, list) => {
  player.setDynamicProperty("eco:acc", JSON.stringify(list));
  invalidate(player);
};
const size = (player) => Number(player.getDynamicProperty("eco:accSize") ?? SIZES[0]);

/** Accessory info of an item (or stored item data). */
function accInfo(stackOrData) {
  const stack = stackOrData?.getLore ? stackOrData : (() => {
    try {
      return deserializeItem(stackOrData);
    } catch {
      return undefined;
    }
  })();
  const info = readItem(stack);
  if (!info?.def || info.kind !== "accessory") return undefined;
  return { ...info, stack };
}

/** Which bag entries count (best of each family). -> Set of indexes */
function activeIndexes(list) {
  const best = new Map();
  list.forEach((d, i) => {
    const a = accInfo(d);
    if (!a) return;
    const fam = a.def.family ?? a.id;
    const score = (a.def.tier ?? 1) * 10 + a.rarity;
    const cur = best.get(fam);
    if (!cur || score > cur.score) best.set(fam, { i, score });
  });
  return new Set([...best.values()].map((b) => b.i));
}

const statCache = new Map(); // player id -> { raw, result }
export function accessoryStats(player) {
  const raw = String(player.getDynamicProperty("eco:acc") ?? "[]");
  const hit = statCache.get(player.id);
  if (hit && hit.raw === raw) return hit.result;
  const result = computeAccessoryStats(bag(player));
  statCache.set(player.id, { raw, result });
  return result;
}

function computeAccessoryStats(list) {
  const on = activeIndexes(list);
  const stats = {};
  const passive = {};
  for (const i of on) {
    const a = accInfo(list[i]);
    for (const [k, v] of Object.entries(itemStats(a))) stats[k] = (stats[k] ?? 0) + v;
    for (const [k, v] of Object.entries(a.def.passive ?? {})) passive[k] = (passive[k] ?? 0) + v;
  }
  return { stats, passive, count: on.size };
}

function deposit(player, slot) {
  const inv = container(player);
  const it = inv.getItem(slot);
  if (!accInfo(it)) return false;
  const list = bag(player);
  if (list.length >= size(player)) return "full";
  const one = serializeItem(it);
  one.n = 1;
  list.push(one);
  saveBag(player, list);
  if (it.amount > 1) {
    it.amount--;
    inv.setItem(slot, it);
  } else inv.setItem(slot, undefined);
  return true;
}

export async function accessoryMenu(player, back) {
  const again = () => accessoryMenu(player, back);
  const list = bag(player);
  const on = activeIndexes(list);
  const cap = size(player);
  const totals = accessoryStats(player).stats;
  const tiles = [
    {
      text: "§a§lADD HELD",
      sub: "§7The item in your hand",
      icon: ICON.confirm,
      onClick: () => {
        const r = deposit(player, player.selectedSlotIndex);
        if (r === true) success(player, "Added to your Accessory Bag.");
        else if (r === "full") fail(player, "Your Accessory Bag is full. Upgrade it!");
        else fail(player, "Hold an accessory (charm, ring, artifact...) first.");
        return again();
      },
    },
    {
      text: "§a§lADD ALL",
      sub: "§7From your inventory",
      icon: ICON.sell,
      onClick: () => {
        const inv = container(player);
        let n = 0;
        for (let i = 0; i < inv.size; i++) {
          while (accInfo(inv.getItem(i))) {
            const r = deposit(player, i);
            if (r !== true) break;
            n++;
          }
        }
        if (n) success(player, `Added ${n} accessories.`);
        else fail(player, "No accessories in your inventory (or the bag is full).");
        return again();
      },
    },
  ];
  const lvl = SIZES.indexOf(cap);
  if (lvl >= 0 && lvl < COSTS.length) {
    tiles.push({
      text: "§6§lUPGRADE BAG",
      sub: `§7${SIZES[lvl + 1]} slots §a${fmtShort(COSTS[lvl])}`,
      icon: "textures/items/leather",
      onClick: () => {
        if (!takeMoney(player, COSTS[lvl])) fail(player, `You need ${fmt(COSTS[lvl])}.`);
        else {
          player.setDynamicProperty("eco:accSize", SIZES[lvl + 1]);
          success(player, `Your Accessory Bag now has ${SIZES[lvl + 1]} slots!`);
        }
        return again();
      },
    });
  }
  list.forEach((d, i) => {
    const a = accInfo(d);
    if (!a) return;
    tiles.push({
      text: `${RARITIES[a.rarity].color}${a.def.name.slice(0, 17)}`,
      sub: on.has(i) ? "§aActive §8- tap: take out" : "§8Duplicate family",
      icon: itemIcon(a.def.item),
      onClick: () => {
        if (freeSlots(player) < 1) {
          fail(player, "You need a free inventory slot.");
          return again();
        }
        const cur = bag(player);
        const [d2] = cur.splice(i, 1);
        saveBag(player, cur);
        container(player).addItem(deserializeItem(d2));
        success(player, `Took out ${a.def.name}.`);
        return again();
      },
    });
  });
  const statStr = Object.entries(totals).filter(([, v]) => v).map(([k, v]) => `${STATS[k].color}+${v} ${STATS[k].name}`).join("§7, ");
  await pagedMenu(player, {
    title: "ACCESSORY BAG",
    theme: "purple",
    body: `§7Slots: §f${list.length}/${cap}    §7Active: §a${on.size}\n§7Bonus: ${statStr || "§8none yet - buy accessories in Shop > Accessories"}`,
    tiles,
    back,
  });
}

export function registerAccessories() {
  statSources.push((player) => {
    const a = accessoryStats(player);
    return a.count ? { label: `Accessories (${a.count})`, stats: a.stats, passive: a.passive } : undefined;
  });
}


