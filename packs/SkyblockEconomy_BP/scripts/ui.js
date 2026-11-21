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

export function ecoTitle(text, theme = "red") {
  return `${MARKER}§${THEME[theme] ?? 1}§r${text}`;
}

/**
 * Shows a styled tile menu.
 *   tiles: [{ text, sub?, icon?, badge?, onClick? }]
 * Each tile is "TEXT" on the first line, "sub" (smaller info) on the second.
 * Resolves to the clicked tile, or undefined if the menu was closed.
 */
export async function tileMenu(player, { title, theme = "red", body = "", tiles }) {
  const form = new ActionFormData().title(ecoTitle(title, theme)).body(body);
  for (const t of tiles) {
    let text = t.text;
    if (t.sub) text += `\n§r${t.sub}`;
    if (t.badge) text += `[${t.badge}]`;
    if (t.icon) form.button(text, t.icon);
    else form.button(text);
  }
  const res = await showForm(player, form);
  if (!res || res.canceled || res.selection === undefined) return undefined;
  const tile = tiles[res.selection];
  if (tile?.onClick) await tile.onClick();
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

export const backTile = (onClick) => ({ text: "§cBACK", sub: "§7Go back", icon: ICON.back, onClick });

export function success(player, msg) {
  player.sendMessage(`§a§l✔ §r§a${msg}`);
  player.playSound("random.orb", { pitch: 1.2 });
}

export function fail(player, msg) {
  player.sendMessage(`§c§l✘ §r§c${msg}`);
  player.playSound("note.bass", { pitch: 0.7 });
}

export const searchTile = (onClick, sub = "§7In this list") => ({ text: "§b§lSEARCH", sub, icon: ICON.search, onClick });

/**
 * Adds navigation tiles around a page of content tiles.
 * Long or multi-page lists get SEARCH / PREV / NEXT / BACK in the top row and
 * PREV / NEXT / BACK again at the bottom; short ones just at the bottom.
 */
export function withNav(content, { page = 0, pages = 1, goto, back, onSearch }) {
  const moves = [];
  if (page > 0) moves.push({ text: "§e§l< PREV", sub: `§7Page ${page}`, icon: ICON.back, onClick: () => goto(page - 1) });
  if (page < pages - 1) moves.push({ text: "§e§lNEXT >", sub: `§7Page ${page + 2}`, icon: ICON.confirm, onClick: () => goto(page + 1) });
  if (back) moves.push(backTile(back));
  const top = onSearch ? [searchTile(onSearch)] : [];
  const long = content.length > 8 || pages > 1;
  if (CONFIG.centerNav) {
    // Centred row at the top (drawn by the resource pack over the grid's first
    // row): tag the nav buttons and pad with hidden fillers to a full row of 4.
    const nav = [...top, ...moves];
    const row = nav.map((t) => ({ ...t, badge: `NAV${nav.length}` }));
    while (row.length < 4) row.push({ text: "", badge: "NAVX" });
    return [...row, ...content, ...(long ? moves : [])];
  }
  if (long) return [...top, ...moves, ...content, ...moves];
  return [...top, ...content, ...moves];
}

/**
 * tileMenu with automatic pages.
 *   opts: { title, theme, body, tiles, back, perPage?, onSearch? }
 */
export async function pagedMenu(player, opts, page = 0) {
  const per = opts.perPage ?? 20;
  const pages = Math.max(1, Math.ceil(opts.tiles.length / per));
  page = Math.min(Math.max(0, page), pages - 1);
  const tiles = withNav(opts.tiles.slice(page * per, page * per + per), {
    page,
    pages,
    goto: (p) => pagedMenu(player, opts, p),
    back: opts.back,
    onSearch: opts.onSearch,
  });
  const info = pages > 1 ? `\n§7Page §f${page + 1}§7/§f${pages}` : "";
  return tileMenu(player, { title: opts.title, theme: opts.theme, body: (opts.body ?? "") + info, tiles });
}

/** Asks for a search word. Resolves to the text, or undefined if cancelled/empty. */
export async function askSearch(player, title) {
  const res = await showForm(player, new ModalFormData().title(title).textField("Item name", "e.g. oak, stairs, diamond"));
  if (!res || res.canceled) return undefined;
  const q = String(res.formValues?.[0] ?? "").trim();
  return q || undefined;
}
