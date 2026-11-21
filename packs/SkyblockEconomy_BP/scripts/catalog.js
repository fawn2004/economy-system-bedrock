import { ItemTypes, world } from "@minecraft/server";
import { CATEGORY_MOVES, DISABLED_ITEMS, PRICE_OVERRIDES } from "./config.js";
import { CATEGORIES, ITEMS } from "./prices.js";

// Builds the shop catalogue from prices.js, then applies (in order):
//   1. config.js  CATEGORY_MOVES / PRICE_OVERRIDES / DISABLED_ITEMS
//   2. edits made in-game with the admin Shop Editor (saved in the world)
// Items this game version doesn't have are skipped automatically.

const EDIT_PREFIX = "eco:edit:";
let catalog;

/** In-game edits for one item: { cat?, hidden?, buy?, sell? } */
export function getEdit(id) {
  try {
    const raw = world.getDynamicProperty(EDIT_PREFIX + id);
    return typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setEdit(id, changes) {
  const next = { ...getEdit(id), ...changes };
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === null) delete next[k];
  world.setDynamicProperty(EDIT_PREFIX + id, Object.keys(next).length ? JSON.stringify(next) : undefined);
  catalog = undefined; // rebuild on next use
}

export function clearEdit(id) {
  world.setDynamicProperty(EDIT_PREFIX + id, undefined);
  catalog = undefined;
}

export function clearAllEdits() {
  for (const k of world.getDynamicPropertyIds()) if (k.startsWith(EDIT_PREFIX)) world.setDynamicProperty(k, undefined);
  catalog = undefined;
}

export function editedItemIds() {
  return world
    .getDynamicPropertyIds()
    .filter((k) => k.startsWith(EDIT_PREFIX))
    .map((k) => k.slice(EDIT_PREFIX.length));
}

export function getCatalog() {
  if (catalog) return catalog;
  const all = new Map(); // every item, including hidden ones
  const catIds = new Set(CATEGORIES.map((c) => c.id));
  const disabled = new Set(DISABLED_ITEMS);
  for (const cat of CATEGORIES) {
    for (const [id, name, icon, buy, sell] of ITEMS[cat.id] ?? []) {
      let exists = true;
      try {
        exists = !!ItemTypes.get(id);
      } catch {}
      if (!exists) continue;
      const o = PRICE_OVERRIDES[id] ?? {};
      const moved = CATEGORY_MOVES[id];
      all.set(id, {
        id,
        name,
        icon,
        defaultIcon: cat.icon,
        buy: o.buy ?? buy,
        sell: o.sell ?? sell,
        defaults: { category: cat.id, buy, sell },
        category: moved && catIds.has(moved) ? moved : cat.id,
        hidden: disabled.has(id),
      });
    }
  }
  // in-game edits
  for (const id of editedItemIds()) {
    const e = all.get(id);
    if (!e) continue;
    const ed = getEdit(id);
    if (ed.cat && catIds.has(ed.cat)) e.category = ed.cat;
    if (typeof ed.hidden === "boolean") e.hidden = ed.hidden;
    if (typeof ed.buy === "number") e.buy = ed.buy;
    if (typeof ed.sell === "number") e.sell = ed.sell;
  }

  const byId = new Map();
  const byCategory = new Map(CATEGORIES.map((c) => [c.id, []]));
  const iconOf = new Map(CATEGORIES.map((c) => [c.id, c.icon]));
  for (const e of all.values()) {
    e.icon = e.icon || iconOf.get(e.category) || e.defaultIcon;
    if (e.hidden) continue;
    byId.set(e.id, e);
    byCategory.get(e.category).push(e);
  }
  for (const list of byCategory.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  catalog = { all, byId, byCategory, categories: CATEGORIES };
  return catalog;
}

export const sellPrice = (typeId) => getCatalog().byId.get(typeId)?.sell ?? 0;

/** Full name of a category, e.g. "Wood > Stairs" */
export function categoryPath(id) {
  const cats = getCatalog().categories;
  const c = cats.find((x) => x.id === id);
  if (!c) return id;
  const parent = c.group === "blocks" ? "Blocks" : cats.find((x) => x.id === c.group)?.name;
  return parent ? `${parent} > ${c.name}` : c.name;
}

/** Items from `pool` whose name or id contains every word of `query`. */
export function filterItems(pool, query) {
  const q = query.toLowerCase().replace(/^minecraft:/, "").trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const out = [];
  for (const e of pool) {
    const hay = (e.name + " " + e.id).toLowerCase();
    if (words.every((w) => hay.includes(w))) out.push(e);
  }
  return out.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
}

export function search(query, { includeHidden = false } = {}) {
  const pool = includeHidden ? getCatalog().all : getCatalog().byId;
  return filterItems(pool.values(), query);
}

/** Every item in a category and all of its sub-sections. */
export function itemsDeep(id) {
  const { categories, byCategory } = getCatalog();
  const out = [...(byCategory.get(id) ?? [])];
  for (const c of categories) if (c.group === id) out.push(...itemsDeep(c.id));
  return out;
}
