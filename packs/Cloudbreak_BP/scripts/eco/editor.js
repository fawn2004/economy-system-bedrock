import { ModalFormData } from "@minecraft/server-ui";
import {
  filterItems,
  categoryPath,
  clearAllEdits,
  clearEdit,
  editedItemIds,
  getCatalog,
  getEdit,
  search,
  setEdit,
} from "./catalog.js";
import { CONFIG, SHOP_LAYOUT } from "./config.js";
import { fmt } from "./economy.js";
import { ICON, askSearch, fail, pagedMenu, showForm, success, tileMenu } from "./ui.js";
import { isAdmin } from "../admin_check.js";

// ============================================================================
//  SHOP EDITOR (admins only)
//  Move items between categories, hide/show them and change prices, live in
//  game. Edits are saved in the world (dynamic properties), so they work on
//  Realms and survive restarts and add-on updates.
// ============================================================================

const clip = (s, n = 18) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export async function editorMenu(player, back, msg) {
  if (!isAdmin(player)) return;
  const reopen = () => editorMenu(player, back);
  const hidden = [...getCatalog().all.values()].filter((e) => e.hidden);
  const edited = editedItemIds().length;
  await tileMenu(player, {
    title: "SHOP EDITOR",
    theme: "red",
    body:
      (msg ? msg + "\n" : "") +
      "§7Find an item, then move it, hide it or change its price.\n" +
      "§8Tip: as an admin you also get an §cEDIT §8button on every item in the shop.",
    tiles: [
      { text: "§b§lSEARCH", sub: "§7Find an item", icon: ICON.coin, onClick: () => searchItems(player, reopen) },
      { text: "§e§lBROWSE", sub: "§7By category", icon: ICON.shop, onClick: () => browseCategories(player, reopen) },
      { text: "§c§lHIDDEN", sub: `§7${hidden.length} items`, icon: ICON.cancel, onClick: () => itemList(player, "HIDDEN ITEMS", hidden, reopen) },
      {
        text: "§6§lEDITED",
        sub: `§7${edited} items`,
        icon: ICON.admin,
        onClick: () => {
          const all = getCatalog().all;
          const items = editedItemIds().map((id) => all.get(id)).filter(Boolean);
          return itemList(player, "EDITED ITEMS", items, reopen);
        },
      },
      {
        text: "§4§lRESET ALL",
        sub: "§7Undo every edit",
        icon: ICON.cancel,
        onClick: () => confirm(player, "RESET ALL EDITS?", `§7This undoes all §f${edited} §7shop edits.`, () => {
          clearAllEdits();
          success(player, "All shop edits were reset.");
          return editorMenu(player, back, "§aAll shop edits were reset.");
        }, reopen),
      },
      { text: "§cBACK", sub: "§7Go back", icon: ICON.back, onClick: back },
    ],
  });
}

async function searchItems(player, back) {
  const res = await showForm(player, new ModalFormData().title("Shop Editor - search").textField("Item name", "e.g. egg, oak stairs"));
  if (!res || res.canceled) return back();
  const q = String(res.formValues?.[0] ?? "");
  const items = search(q, { includeHidden: true }).slice(0, 200);
  if (!items.length) {
    fail(player, `No items found for "${q}".`);
    return back();
  }
  return itemList(player, `SEARCH: ${clip(q.toUpperCase(), 14)}`, items, back);
}

// ---- category tree (same layout as the shop: Blocks > Wood > Stairs ...) ----
function children(id) {
  return getCatalog().categories.filter((c) => c.group === id);
}

function countDeep(id) {
  const { byCategory } = getCatalog();
  let n = byCategory.get(id)?.length ?? 0;
  for (const c of children(id)) n += countDeep(c.id);
  return n;
}

/**
 * Lets the admin walk the category tree.
 *   onPick(category) is called when a category is chosen.
 *   pickLabel: text for the "choose this category" tile on categories that have sub-sections.
 */
function categoryTree(player, opts, nodeId = null, back = opts.back) {
  const { categories } = getCatalog();
  const reopen = () => categoryTree(player, opts, nodeId, back);
  const tileFor = (c) => {
    const subs = children(c.id);
    const current = opts.current === c.id;
    return {
      text: `${current ? "§a" : "§e"}§l${clip(c.name.toUpperCase(), 16)}`,
      sub: current ? "§aCurrent" : subs.length ? `§7${subs.length} sections` : `§7${countDeep(c.id)} items`,
      icon: c.icon,
      onClick: () => (subs.length ? categoryTree(player, opts, c.id, reopen) : opts.onPick(c, reopen)),
    };
  };

  let tiles = [];
  let title = opts.title;
  if (nodeId === null) {
    const order = [...SHOP_LAYOUT];
    const top = categories.filter((c) => !c.group).sort((a, b) => rank(order, a.id) - rank(order, b.id));
    tiles.push({
      text: "§e§lBLOCKS",
      sub: `§7${children("blocks").length} sections`,
      icon: "textures/ui/eco/icon_blocks",
      onClick: () => categoryTree(player, opts, "blocks", reopen),
    });
    tiles.push(...top.map(tileFor));
  } else if (nodeId === "blocks") {
    title = "BLOCKS";
    tiles = children("blocks").map(tileFor);
  } else {
    const c = categories.find((x) => x.id === nodeId);
    title = c.name.toUpperCase();
    tiles.push({
      text: `§a§l${opts.pickLabel}`,
      sub: `§7In ${clip(c.name, 14)}`,
      icon: ICON.confirm,
      onClick: () => opts.onPick(c, reopen),
    });
    tiles.push(...children(c.id).map(tileFor));
  }
  return pagedMenu(player, { title, theme: "red", body: opts.body, tiles, back });
}

const rank = (order, id) => {
  const i = order.indexOf(id);
  return i < 0 ? 999 : i;
};

function browseCategories(player, back) {
  return categoryTree(player, {
    title: "BROWSE",
    body: "§7Pick the category you want to edit.",
    pickLabel: "OTHER ITEMS",
    back,
    onPick: (c, reopen) => itemList(player, c.name.toUpperCase(), getCatalog().byCategory.get(c.id) ?? [], reopen),
  });
}

function itemList(player, title, items, back) {
  const tiles = items.map((e) => ({
    text: `${e.hidden ? "§c" : "§f"}${clip(e.name)}`,
    sub: e.hidden ? "§cHidden" : `§7${clip(categoryPath(e.category), 16)}`,
    icon: e.icon,
    onClick: () => editItemMenu(player, e.id, () => itemList(player, title, refresh(items), back)),
  }));
  return pagedMenu(player, {
    title,
    theme: "red",
    body: `§7Click an item to edit it. §8(${items.length} items)`,
    tiles,
    back,
    onSearch: async () => {
      const q = await askSearch(player, `Search ${title.toLowerCase()}`);
      const reopen = () => itemList(player, title, refresh(items), back);
      if (!q) return reopen();
      const found = filterItems(refresh(items), q);
      if (!found.length) {
        fail(player, `Nothing in this list matches "${q}".`);
        return reopen();
      }
      return itemList(player, `FOUND: ${clip(q.toUpperCase(), 12)}`, found, reopen);
    },
  });
}

const refresh = (items) => items.map((e) => getCatalog().all.get(e.id) ?? e);

/** The edit screen for one item. Also opened from the EDIT button in the shop. */
export async function editItemMenu(player, id, back, msg) {
  if (!isAdmin(player)) return;
  const e = getCatalog().all.get(id);
  if (!e) return back();
  const reopen = (m) => editItemMenu(player, id, back, m);
  const d = e.defaults;
  const changed = [];
  if (e.category !== d.category) changed.push(`§7was in §f${categoryPath(d.category)}`);
  if (e.buy !== d.buy || e.sell !== d.sell) changed.push(`§7default price §a${fmt(d.buy)}§7/§6${fmt(d.sell)}`);
  await tileMenu(player, {
    title: `EDIT: ${clip(e.name.toUpperCase(), 18)}`,
    theme: "red",
    body:
      (msg ? msg + "\n" : "") +
      `§f${e.name} §8(${e.id})\n` +
      `§7Category: §e${categoryPath(e.category)}${e.hidden ? "  §c(HIDDEN)" : ""}\n` +
      `§7Buy: §a${e.buy > 0 ? fmt(e.buy) : "not for sale"}   §7Sell: §6${e.sell > 0 ? fmt(e.sell) : "can't be sold"}` +
      (changed.length ? `\n${changed.join("   ")}` : ""),
    tiles: [
      { text: "§e§lMOVE", sub: "§7Change category", icon: ICON.shop, onClick: () => moveMenu(player, e, back, () => reopen()) },
      e.hidden
        ? { text: "§a§lSHOW", sub: "§7Put back in shop", icon: ICON.confirm, onClick: () => { setEdit(id, { hidden: false }); success(player, `${e.name} is back in the shop.`); return reopen(`§a${e.name} is back in the shop.`); } }
        : { text: "§c§lHIDE", sub: "§7Remove from shop", icon: ICON.cancel, onClick: () => { setEdit(id, { hidden: true }); success(player, `${e.name} was removed from the shop.`); return reopen(`§c${e.name} was removed from the shop and can't be sold.`); } },
      { text: "§6§lPRICE", sub: "§7Buy & sell price", icon: ICON.coin, onClick: () => priceForm(player, e, reopen) },
      { text: "§7§lRESET", sub: "§7Undo edits", icon: ICON.back, onClick: () => { clearEdit(id); success(player, `${e.name} was reset.`); return reopen(`§a${e.name} was reset to its defaults.`); } },
      { text: "§cBACK", sub: "§7Go back", icon: ICON.back, onClick: back },
    ],
  });
}

function moveMenu(player, e, itemBack, cancel) {
  return categoryTree(player, {
    title: `MOVE ${clip(e.name.toUpperCase(), 16)}`,
    body: `§7Where should §f${e.name} §7go?  §8(now: ${categoryPath(e.category)})`,
    pickLabel: "PUT HERE",
    current: e.category,
    back: cancel,
    onPick: (c) => {
      setEdit(e.id, { cat: c.id === e.defaults.category ? undefined : c.id });
      success(player, `Moved ${e.name} to ${categoryPath(c.id)}.`);
      return editItemMenu(player, e.id, itemBack, `§aMoved to §f${categoryPath(c.id)}`);
    },
  });
}

async function priceForm(player, e, reopen) {
  const res = await showForm(
    player,
    new ModalFormData()
      .title(`Price: ${e.name}`)
      .textField(`Buy price (0 = not for sale)\n§7Default: ${fmt(e.defaults.buy)}`, String(e.buy), { defaultValue: String(e.buy) })
      .textField(
        `Sell price (0 = can't be sold)\n§7Default: ${fmt(e.defaults.sell)}\n§cKeep sell below buy, and below the cost of crafting it, or players can make free money.`,
        String(e.sell),
        { defaultValue: String(e.sell) }
      )
  );
  if (!res || res.canceled) return reopen();
  const [buy, sell] = res.formValues.map((v) => Math.floor(Number(String(v).replace(/[,$\s]/g, ""))));
  if (![buy, sell].every((n) => Number.isFinite(n) && n >= 0)) {
    fail(player, "Prices must be whole numbers (0 or more).");
    return reopen("§cPrices must be whole numbers.");
  }
  if (buy > 0 && sell > buy) {
    fail(player, "The sell price can't be higher than the buy price.");
    return reopen("§cSell price can't be higher than the buy price!");
  }
  setEdit(e.id, { buy: buy === e.defaults.buy ? undefined : buy, sell: sell === e.defaults.sell ? undefined : sell });
  success(player, `${e.name}: buy ${fmt(buy)}, sell ${fmt(sell)}.`);
  return reopen(`§aNew price: buy §f${fmt(buy)}§a, sell §f${fmt(sell)}`);
}

function confirm(player, title, body, yes, no) {
  return tileMenu(player, {
    title,
    theme: "red",
    body,
    tiles: [
      { text: "§a§lYES", sub: "§7Do it", icon: ICON.confirm, onClick: yes },
      { text: "§c§lNO", sub: "§7Cancel", icon: ICON.cancel, onClick: no },
    ],
  });
}
