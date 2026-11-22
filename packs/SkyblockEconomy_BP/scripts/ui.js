import { system } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG, THEME } from "./config.js";

// Any form whose title starts with this marker is drawn with the custom
// Skyblock Economy layout from the resource pack (ui/eco_form.json).
const MARKER = "§e§c§o";

export const ICON = {
  shop: "textures/ui/eco/icon_shop",
  sell: "textures/ui/eco/icon_sell",
  bank: "textures/ui/eco/icon_bank",
  pay: "textures/ui/eco/icon_pay",
  top: "textures/ui/eco/icon_top",
  admin: "textures/ui/eco/icon_admin",
  back: "textures/ui/eco/icon_back",
  player: "textures/ui/eco/icon_player",
  confirm: "textures/ui/eco/icon_confirm",
  cancel: "textures/ui/eco/icon_cancel",
  coin: "textures/ui/eco/icon_coin",
  search: "textures/ui/eco/icon_search",
};

// Extra marker after the theme = the old dashboard layout (kept so older calls still work)
const DASHBOARD = "§d§b§r";

export function ecoTitle(text, theme = "red", layout) {
  return `${MARKER}§${THEME[theme] ?? 1}§r${layout === "dashboard" ? DASHBOARD : ""}${text}`;
}

// ---- chest layout ---------------------------------------------------------------
// Menus are drawn as a chest (ui/eco_form.json): a 9-wide grid of slots. Content goes
// in the middle 7 columns of up to 4 rows (28 per page), framed by glass panes, with
// page arrows, Go Back and Close in the bottom row - like a server-side chest GUI.
export const PER_PAGE = 28;
const COLS = 9;
const INNER = 7;
const FILLER_ICON = "textures/blocks/glass_black";
const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;
const KEEP_CAPS = new Set(["XP", "HP", "NPC", "NPCS", "RPG", "AH", "ID", "BIN", "UI"]);

/** "§6§lAUCTION HOUSE" -> "§6Auction House" (keeps colours, roman numerals and acronyms like XP). */
export function niceName(text) {
  return String(text)
    .replace(/§l/g, "")
    .replace(/(?<=^|[^A-Za-z]|§[0-9a-z])([A-Z][A-Z']+)(?![A-Za-z])/g, (w) => (ROMAN.test(w) || KEEP_CAPS.has(w) ? w : w[0] + w.slice(1).toLowerCase()));
}
const niceTitle = (t) => (/§/.test(t) ? t : niceName(t));

function tooltipText(t) {
  let text = niceName(t.text);
  if (t.badge === "NEW") text += " §a§lNEW";
  if (t.sub) text += `\n§r${t.sub}`;
  if (t.lore) text += `\n${t.lore}`;
  if ((t.onClick || t.id) && !t.nav && !t.noClick) text += "\n§eClick!";
  return text;
}

const filler = () => ({ text: "[F]", icon: FILLER_ICON, filler: true });

/** Positions (0-6) for k items in a row: spread out when there are only a few. */
function rowCols(k, onlyRow) {
  if (onlyRow && k === 1) return [3];
  if (onlyRow && k === 2) return [1, 5];
  if (onlyRow && k === 3) return [1, 3, 5];
  const start = Math.floor((INNER - k) / 2);
  return Array.from({ length: k }, (_, i) => start + i);
}

/** Lays content + nav tiles out as chest slots. */
function chestSlots(content, nav) {
  const rows = Math.max(1, Math.ceil(content.length / INNER));
  const slots = [];
  for (let i = 0; i < COLS; i++) slots.push(filler());
  for (let r = 0; r < rows; r++) {
    const row = content.slice(r * INNER, r * INNER + INNER);
    const line = [filler()];
    const cells = Array.from({ length: INNER }, () => filler());
    rowCols(row.length, rows === 1).forEach((c, i) => (cells[c] = row[i]));
    line.push(...cells, filler());
    slots.push(...line);
  }
  const bottom = Array.from({ length: COLS }, () => filler());
  if (nav.prev) bottom[0] = nav.prev;
  if (nav.back) bottom[3] = nav.back;
  bottom[4] = { text: "§cClose", icon: "textures/blocks/barrier", nav: "close" };
  if (nav.search) bottom[5] = nav.search;
  if (nav.next) bottom[8] = nav.next;
  slots.push(...bottom);
  return slots;
}

/**
 * Shows a chest menu.
 *   tiles: [{ text, sub?, lore?, icon?, badge?, onClick?, nav? }]
 * Tiles with nav "back" / "prev" / "next" / "search" go in the bottom row. More than 28
 * content tiles are split into pages automatically.
 * Resolves to the clicked tile, or undefined if the menu was closed.
 */
export async function tileMenu(player, opts) {
  const { title, theme = "red", body = "", tiles, layout } = opts;
  const nav = {};
  const content = [];
  for (const t of tiles) {
    if (!t || t.badge === "NAVX") continue;
    if (t.nav && t.nav !== "close") nav[t.nav] = t;
    else content.push(t);
  }
  let page = opts._page ?? 0;
  const pages = Math.max(1, Math.ceil(content.length / PER_PAGE));
  page = Math.min(Math.max(0, page), pages - 1);
  let shown = content;
  let info = "";
  if (pages > 1) {
    shown = content.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
    if (page > 0) nav.prev = { text: "§aPrevious Page", sub: `§ePage ${page}`, icon: "textures/items/arrow", nav: "prev", onClick: () => tileMenu(player, { ...opts, _page: page - 1 }) };
    if (page < pages - 1) nav.next = { text: "§aNext Page", sub: `§ePage ${page + 2}`, icon: "textures/items/arrow", nav: "next", onClick: () => tileMenu(player, { ...opts, _page: page + 1 }) };
    info = `\n§7Page §f${page + 1}§7/§f${pages}`;
  }
  const slots = chestSlots(shown, nav);
  const form = new ActionFormData().title(ecoTitle(niceTitle(title), theme, layout)).body(body ? body + info : info.trim());
  for (const t of slots) {
    const text = t.filler ? "[F]" : tooltipText(t);
    if (t.icon) form.button(text, t.icon);
    else form.button(text);
  }
  const res = await showForm(player, form);
  if (!res || res.canceled || res.selection === undefined) return undefined;
  const tile = slots[res.selection];
  if (!tile || tile.nav === "close") return undefined;
  if (tile.filler) return tileMenu(player, opts); // glass pane: nothing happens
  if (tile.onClick) await tile.onClick();
  return tile;
}

/** form.show() that waits while the player is busy (e.g. chat open). */
export async function showForm(player, form) {
  for (let tries = 0; tries < 40; tries++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (res.cancelationReason !== FormCancelationReason.UserBusy) return res;
    await system.waitTicks(5);
  }
  return undefined;
}

export const backTile = (onClick) => ({ text: "§aGo Back", sub: "§7To the previous menu", icon: "textures/items/arrow", nav: "back", onClick });

export function success(player, msg) {
  player.sendMessage(`§a§l✔ §r§a${msg}`);
  player.playSound("random.orb", { pitch: 1.2 });
}

export function fail(player, msg) {
  player.sendMessage(`§c§l✘ §r§c${msg}`);
  player.playSound("note.bass", { pitch: 0.7 });
}

export const searchTile = (onClick, sub = "§7In this list") => ({ text: "§aSearch", sub, icon: "textures/items/sign", nav: "search", onClick });

/** Adds page arrows, Go Back and Search to a page of content tiles. */
export function withNav(content, { page = 0, pages = 1, goto, back, onSearch }) {
  const out = [...content];
  if (page > 0) out.push({ text: "§aPrevious Page", sub: `§ePage ${page}`, icon: "textures/items/arrow", nav: "prev", onClick: () => goto(page - 1) });
  if (page < pages - 1) out.push({ text: "§aNext Page", sub: `§ePage ${page + 2}`, icon: "textures/items/arrow", nav: "next", onClick: () => goto(page + 1) });
  if (back) out.push(backTile(back));
  if (onSearch) out.push(searchTile(onSearch));
  return out;
}

/**
 * tileMenu with automatic pages.
 *   opts: { title, theme, body, tiles, back, onSearch? }
 */
export async function pagedMenu(player, opts, page = 0) {
  const tiles = [...opts.tiles];
  if (opts.back) tiles.push(backTile(opts.back));
  if (opts.onSearch) tiles.push(searchTile(opts.onSearch));
  return tileMenu(player, { title: opts.title, theme: opts.theme, body: opts.body ?? "", tiles, _page: page });
}

/** Asks for a search word. Resolves to the text, or undefined if cancelled/empty. */
export async function askSearch(player, title) {
  const res = await showForm(player, new ModalFormData().title(title).textField("Item name", "e.g. oak, stairs, diamond"));
  if (!res || res.canceled) return undefined;
  const q = String(res.formValues?.[0] ?? "").trim();
  return q || undefined;
}

/** "2500", "2,500", "$2.5k", "1.2m", "3b" -> number (NaN if it isn't one). */
export function parseAmount(text) {
  const s = String(text ?? "").toLowerCase().replace(/[,$\s]/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)([kmbt]?)$/);
  if (!m) return NaN;
  const mult = { "": 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2]];
  return Math.floor(Number(m[1]) * mult);
}

/** Asks for a whole number above 0 (accepts 2.5k / 1m). Resolves to it, or undefined. */
export async function askAmount(player, title, label, placeholder = "e.g. 2500 or 2.5k") {
  const res = await showForm(player, new ModalFormData().title(title).textField(label, placeholder));
  if (!res || res.canceled) return undefined;
  const n = parseAmount(res.formValues?.[0]);
  if (!Number.isFinite(n) || n <= 0) {
    fail(player, "Enter a whole number above 0 (you can use k / m / b).");
    return undefined;
  }
  return n;
}
