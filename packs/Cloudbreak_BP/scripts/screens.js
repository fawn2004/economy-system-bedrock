import { system } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";

// Cloudbreak screens (resource pack ui/cb_screens.json, built by
// tools/build_cloudbreak_screens.py). A form whose title starts with a
// screen's marker is drawn with that screen. Every button starts with a zone
// tag ("[FL]") that says where it goes, plus optional state tags ("[ON]").
// Zones that aren't clickable just show the text/icon.

export const SCREEN_CODES = {
  tower: "0", members: "1", bank: "2", settings: "3", admin: "4", dispatch: "5",
  insurance: "6", shop: "7", crate: "8", raidlog: "9", boards: "a", terminal: "t",
};

import { LAYOUT } from "./screen_layout.js";

/** "Clan Nightfall" -> "C L A N   N I G H T F A L L" (the mockups' spaced captions). */
export const spaced = (s) => String(s).toUpperCase().split(" ").map((w) => w.split("").join(" ")).join("   ");

/** A pixel head for a player name (always the same one for the same name). */
export function headFor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `textures/ui/cb/s/head_${h % 7}`;
}

// ---- Back arrow ---------------------------------------------------------------
// Each player remembers where Back should go: the main menu, or the Core Terminal
// when a menu was opened from it. Menus that redraw themselves keep it.
const backTo = new Map();
let defaultBack = () => {};
export const setDefaultBack = (fn) => (defaultBack = fn);
export const setBack = (player, fn) => backTo.set(player.id, fn);
const goBack = (player) => (backTo.get(player.id) ?? defaultBack)(player);

export const BANNER = (i) => `textures/ui/cb/s/banner_${((i % 10) + 10) % 10}`;
export const ART = (name) => `textures/ui/cb/s/${name}`;

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

  /** The items in the order the screen expects (screen_layout.js): the grid's cells
   *  first (padded with blanks), then one item per single zone (a blank if missing),
   *  then the lists. Blanks carry no zone tag, so they show nowhere. */
  ordered() {
    const L = LAYOUT[this.id] ?? { grid: null, gridSize: 0, singles: [] };
    const blank = { tag: "_", text: "", states: [], run: undefined };
    const used = new Set();
    const out = [];
    const grid = this.items.filter((i) => i.tag === L.grid).slice(0, L.gridSize);
    grid.forEach((i) => used.add(i));
    out.push(...grid);
    while (out.length < L.gridSize) out.push(blank);
    for (const tag of L.singles) {
      const it = this.items.find((i) => i.tag === tag && !used.has(i));
      if (it) used.add(it);
      out.push(it ?? blank);
    }
    for (const i of this.items) if (!used.has(i) && !(L.singles.includes(i.tag)) && i.tag !== L.grid) out.push(i);
    return out;
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

  /** Shows the screen; runs the tapped item. Resolves to the tapped item (or undefined). */
  async show(player) {
    if ((LAYOUT[this.id]?.singles ?? []).includes("BACK") && !this.items.some((i) => i.tag === "BACK"))
      this.button("BACK", "", () => goBack(player));
    const form = this.form();
    Screen.last = this;
    const order = this.ordered();
    let res;
    for (let tries = 0; tries < 40; tries++) {
      if (!player.isValid) return undefined;
      res = await form.show(player);
      if (res.cancelationReason !== FormCancelationReason.UserBusy) break;
      await system.waitTicks(5);
    }
    if (!res || res.canceled || res.selection === undefined) return undefined;
    const it = order[res.selection];
    if (it?.run) await it.run();
    return it;
  }
}
