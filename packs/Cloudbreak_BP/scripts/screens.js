import { system } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { LAYOUT } from "./screen_layout.js";

// ---------------------------------------------------------------------------
// Cloudbreak screens. The resource pack (ui/cb_screens.json, built by
// tools/build_cloudbreak_screens.py) draws a form with a custom screen when its
// title starts with that screen's marker "§c§b§<code>§r".
//
// Every button's text starts with a zone tag, e.g. "[TL]Clan Bank": the screen
// shows it in the zone with that tag. Extra state tags ("[ON]", "[cRED]") pick
// colours. Items in a non-tappable zone are just text/pictures.
//
// Button order: the screen's grid zone (if it has one) shows form buttons 0, 1,
// 2... in its cells, so the grid's items are sent first. Everything else follows.
// ---------------------------------------------------------------------------

export const SCREEN_CODES = {
  tower: "0", members: "1", bank: "2", settings: "3", admin: "4", dispatch: "5",
  insurance: "6", shop: "7", crate: "8", raidlog: "9", boards: "a", terminal: "t",
};

/** "Clan Nightfall" -> "C L A N   N I G H T F A L L" (the mockups' spaced captions). */
export const spaced = (s) => String(s).toUpperCase().split(" ").map((w) => w.split("").join(" ")).join("   ");

/** A pixel head for a player name (always the same one for the same name). */
export function headFor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `textures/ui/cb/s/head_${h % 7}`;
}

export const BANNER = (i) => `textures/ui/cb/s/banner_${((i % 10) + 10) % 10}`;
export const ART = (name) => `textures/ui/cb/s/${name}`;

// ---- Back arrow ---------------------------------------------------------------
// Each player remembers where Back goes: the main menu, or the Core Terminal when a
// menu was opened from it. A menu that redraws itself keeps the same target.
const backTo = new Map();
let defaultBack = () => {};
export const setDefaultBack = (fn) => (defaultBack = fn);
export const setBack = (player, fn) => backTo.set(player.id, fn);
const goBack = (player) => (backTo.get(player.id) ?? defaultBack)(player);

export class Screen {
  constructor(id, title = "") {
    this.id = id;
    this.title = title;
    this.items = [];
  }

  /** Text (and/or a picture) in a zone that can't be tapped. */
  text(tag, text, opts = {}) {
    this.items.push({ tag, text: String(text ?? ""), icon: opts.icon, states: opts.states ?? [], run: undefined });
    return this;
  }

  /** A tappable item. run() is called when it's tapped. */
  button(tag, text, run, opts = {}) {
    this.items.push({ tag, text: String(text ?? ""), icon: opts.icon, states: opts.states ?? [], run: run ?? (() => {}) });
    return this;
  }

  /** The items in the order they go into the form: the grid zone's items first. */
  ordered() {
    const grid = LAYOUT[this.id]?.grid;
    if (!grid) return [...this.items];
    return [...this.items.filter((i) => i.tag === grid), ...this.items.filter((i) => i.tag !== grid)];
  }

  form() {
    const form = new ActionFormData().title(`§c§b§${SCREEN_CODES[this.id]}§r${this.title}`).body("");
    for (const it of this.ordered()) {
      const text = `[${it.tag}]${it.states.filter(Boolean).map((s) => `[${s}]`).join("")}${it.text}`;
      if (it.icon) form.button(text, it.icon);
      else form.button(text);
    }
    return form;
  }

  /** Shows the screen and runs the tapped item. Resolves to the tapped item (or undefined). */
  async show(player) {
    if (LAYOUT[this.id]?.back && !this.items.some((i) => i.tag === "BACK")) this.button("BACK", "", () => goBack(player));
    const order = this.ordered();
    const form = this.form();
    Screen.last = this;
    let res;
    for (let tries = 0; tries < 40; tries++) {
      if (!player.isValid) return undefined;
      res = await form.show(player);
      if (res.cancelationReason !== FormCancelationReason.UserBusy) break;
      await system.waitTicks(5);
    }
    if (!res || res.canceled || res.selection === undefined) return undefined;
    const it = order[res.selection];
    if (!it?.run) return it;
    try {
      await it.run();
    } catch (e) {
      // never fail silently: say what went wrong, in chat and in the content log
      console.warn(`[cloudbreak] ${this.id} button "${it.tag}": ${e?.stack ?? e}`);
      try {
        player.sendMessage(`§c[Cloudbreak] That button hit an error: ${e?.message ?? e}`);
      } catch {}
    }
    return it;
  }
}
