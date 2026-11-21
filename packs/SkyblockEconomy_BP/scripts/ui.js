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
