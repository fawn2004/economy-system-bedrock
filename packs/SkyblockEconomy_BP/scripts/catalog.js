import { ItemTypes } from "@minecraft/server";
import { DISABLED_ITEMS, PRICE_OVERRIDES } from "./config.js";
import { CATEGORIES, ITEMS } from "./prices.js";

// Builds the shop catalogue from prices.js (+ config overrides) the first time
// it's needed. Items this game version doesn't have are skipped automatically.

let catalog;

export function getCatalog() {
  if (catalog) return catalog;
  const byId = new Map();
  const byCategory = new Map();
  const disabled = new Set(DISABLED_ITEMS);
  for (const cat of CATEGORIES) {
    const list = [];
    for (const [id, name, icon, buy, sell] of ITEMS[cat.id] ?? []) {
      if (disabled.has(id)) continue;
      let exists = true;
      try {
        exists = !!ItemTypes.get(id);
      } catch {}
      if (!exists) continue;
      const o = PRICE_OVERRIDES[id] ?? {};
      const entry = {
        id,
        name,
        icon: icon || cat.icon,
        buy: o.buy ?? buy,
        sell: o.sell ?? sell,
        category: cat.id,
      };
      list.push(entry);
      byId.set(id, entry);
    }
    byCategory.set(cat.id, list);
  }
  catalog = { byId, byCategory, categories: CATEGORIES };
  return catalog;
}

export const sellPrice = (typeId) => getCatalog().byId.get(typeId)?.sell ?? 0;

export function search(query) {
  const q = query.toLowerCase().replace(/^minecraft:/, "").trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const out = [];
  for (const e of getCatalog().byId.values()) {
    const hay = (e.name + " " + e.id).toLowerCase();
    if (words.every((w) => hay.includes(w))) out.push(e);
  }
  return out.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
}
