import { system } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { THEME } from "./config.js";

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

/**
 * tileMenu with automatic pages: shows `perPage` tiles plus PREV / NEXT / BACK.
 *   opts: { title, theme, body, tiles, back, perPage? }
 */
export async function pagedMenu(player, opts, page = 0) {
  const per = opts.perPage ?? 20;
  const pages = Math.max(1, Math.ceil(opts.tiles.length / per));
  page = Math.min(Math.max(0, page), pages - 1);
  const tiles = opts.tiles.slice(page * per, page * per + per);
  if (page > 0) tiles.push({ text: "§e§l< PREV", sub: `§7Page ${page}`, icon: ICON.back, onClick: () => pagedMenu(player, opts, page - 1) });
  if (page < pages - 1) tiles.push({ text: "§e§lNEXT >", sub: `§7Page ${page + 2}`, icon: ICON.confirm, onClick: () => pagedMenu(player, opts, page + 1) });
  if (opts.back) tiles.push(backTile(opts.back));
  const info = pages > 1 ? `\n§7Page §f${page + 1}§7/§f${pages}` : "";
  return tileMenu(player, { title: opts.title, theme: opts.theme, body: (opts.body ?? "") + info, tiles });
}
