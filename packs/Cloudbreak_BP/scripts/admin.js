import { ItemLockMode, ItemStack, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG, UPGRADES } from "./config.js";
import { allClans, getClan, saveClan, tellClan } from "./clans.js";
import { bankOf } from "./bank.js";
import { activeRaids, forceEndRaid, raidStatus } from "./raids.js";
import { giveKey } from "./after.js";
import { addMoney, fmt, fmtMoney, getBalance, setBalance } from "./eco/economy.js";
import { KITS, SPAWNERS } from "./eco/config.js";
import { addHeadPoints, makeSpawnerItem, mobIcon } from "./eco/spawners.js";
import { Screen, headFor } from "./screens.js";
import { adminMenu as ecoAdminMenu, giveKit } from "./eco/menus.js";
import { makeHopperItem } from "./eco/chunkHopper.js";
import { clearGroundItems } from "./eco/groundItems.js";
import { ecoTitle } from "./eco/ui.js";
import { loadJson, saveJson } from "./store.js";

// ---------------------------------------------------------------------------
// Admin Control Room (players tagged "admin").
// For any selected player: Money, Heads, Kits, Crate Keys.
// Only when the SELECTED player has the admin tag: Custom Items, Server Rules,
// Clans, Reset Clan, Force End Raid, Clear Items, Economy Settings. That way
// an admin looking at a normal player can't give them admin things by accident.
// ---------------------------------------------------------------------------

const ADMIN = "admin";
const CB = new Proxy({}, { get: (_, n) => `textures/ui/cb/icon_${String(n)}` });

async function show(player, form) {
  for (let i = 0; i < 40; i++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (res.cancelationReason !== FormCancelationReason.UserBusy) return res;
    await system.waitTicks(5);
  }
  return undefined;
}

/** A pink admin tile menu. tiles: [{ text, sub, icon, run }] */
async function tiles(player, title, body, list) {
  const form = new ActionFormData().title(ecoTitle(title, "pink")).body(body);
  for (const t of list) {
    const text = t.sub ? `${t.text}\n§r${t.sub}` : t.text;
    if (t.icon) form.button(text, t.icon);
    else form.button(text);
  }
  const res = await show(player, form);
  if (!res || res.canceled) return;
  await list[res.selection]?.run?.();
}

const back = (fn) => ({ text: "§cBACK", sub: "§7Go back", icon: CB.back, run: fn });
const say = (p, msg, ok = true) => p.sendMessage(`${CONFIG.prefix}${ok ? "§a" : "§c"}${msg}`);

async function askNumber(player, title, label, def = "") {
  const res = await show(player, new ModalFormData().title(title).textField(label, "a number", { defaultValue: String(def) }));
  if (!res || res.canceled) return undefined;
  const n = Number(String(res.formValues?.[0] ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

function giveStack(target, stack) {
  const left = target.getComponent("minecraft:inventory")?.container?.addItem(stack);
  if (left) target.dimension.spawnItem(left, target.location);
}

// ---------------------------------------------------------------------------
// Control Room screen: players on the left, the picked player in the middle,
// admin-only tools on the right (unlocked only when the picked player is an admin)
// ---------------------------------------------------------------------------

const CATS = [
  { id: "money", name: "Money", icon: "textures/ui/eco/icon_coin", head: "CHOOSE WHAT TO DO", steps: [["-10k", -10000], ["+10k", 10000], ["+1M", 1000000]], def: 10000 },
  { id: "heads", name: "Heads", icon: CB.skull, head: "CHOOSE A MOB", steps: [["-1", -1], ["+1", 1], ["+5", 5]], def: 1 },
  { id: "kits", name: "Kits", icon: CB.chest, head: "CHOOSE A KIT", steps: [["-1", -1], ["+1", 1], ["+5", 5]], def: 1 },
  { id: "keys", name: "Crate Keys", icon: CB.key, head: "CHOOSE A CRATE", steps: [["-1", -1], ["+1", 1], ["+5", 5]], def: 1 },
];
const KEY_ART = { raider: "key_pink", defender: "key_cyan", legendary: "key_gold" };
const MONEY_MODES = [
  { id: "give", name: "Give", sub: "To their wallet", icon: CB.sell },
  { id: "take", name: "Take", sub: "From their wallet", icon: CB.no },
  { id: "set", name: "Set", sub: "Set their wallet", icon: "textures/ui/eco/icon_coin" },
];

function optionsFor(cat) {
  if (cat === "money") return MONEY_MODES;
  if (cat === "heads") return SPAWNERS.filter((s) => !s.disabled).map((s) => ({ id: s.mob, name: s.name, sub: "Heads", icon: mobIcon(s.mob) }));
  if (cat === "kits") return KITS.filter((k) => !k.disabled).map((k) => ({ id: k.name, name: k.name, sub: `${k.items.length} items`, icon: CB.chest, kit: k }));
  return Object.entries(CONFIG.crates).map(([id, c]) => ({ id, name: c.name, sub: { raider: "Raid gear, money", defender: "Defence rewards", legendary: "Spawners, big money" }[id] ?? "", icon: `textures/ui/cb/s/${KEY_ART[id] ?? "key_gold"}` }));
}

export async function adminPanel(player, st = {}) {
  if (!player.hasTag(ADMIN)) return say(player, "Only admins can open this.", false);
  const all = world.getPlayers().sort((a, b) => a.name.localeCompare(b.name));
  const filter = (st.filter ?? "").toLowerCase();
  const players = filter ? all.filter((p) => p.name.toLowerCase().includes(filter)) : all;
  const target = all.find((p) => p.id === st.targetId) ?? players[0] ?? player;
  const cat = CATS.find((c) => c.id === st.cat) ?? CATS[3];
  const opts = optionsFor(cat.id);
  const opt = opts.find((o) => o.id === st.opt) ?? opts[0];
  const n = Math.max(cat.id === "money" ? 0 : 1, st.n ?? cat.def);
  const again = (o) => adminPanel(player, { targetId: target.id, cat: cat.id, opt: opt?.id, n, filter: st.filter, optPage: st.optPage, ...o });
  const isAdmin = target.hasTag(ADMIN);
  const clan = (p) => allClans().find((c) => c.members[p.id]);

  const s = new Screen("admin", "Control Room");
  // 6 choices fit; with more, show 5 and a "More" card that flips the page
  const per = opts.length > 6 ? 5 : 6;
  const pages = Math.max(1, Math.ceil(opts.length / per));
  const op = Math.min(st.optPage ?? 0, pages - 1);
  for (const o of opts.slice(op * per, op * per + per)) s.button("OPT", `§f${o.name}\n§7${o.sub}`, () => again({ opt: o.id, optPage: op }), { icon: o.icon, states: [o === opt ? "ON" : undefined] });
  if (pages > 1) s.button("OPT", `§fMore\n§7Page ${op + 1} of ${pages}`, () => again({ optPage: (op + 1) % pages }), { icon: CB.plus });
  s.text("PILL", `§7Online §f${all.length}`);
  s.text("PILL", `§7Raids §c${activeRaids().length}`);
  s.text("PILL", `§7Clans §f${allClans().length}`);
  s.button("SR", filter ? `§fSearch: ${st.filter}` : "Search name...", async () => {
    const res = await show(player, new ModalFormData().title("Search players").textField("Name (leave empty to show everyone)", "e.g. Kai", { defaultValue: st.filter ?? "" }));
    if (!res || res.canceled) return again({});
    return again({ filter: String(res.formValues?.[0] ?? "").trim() });
  });
  for (const p of players) {
    const c = clan(p);
    s.button("PL", `§f${p.name}\n§7${c ? c.name : "No clan"}`, () => again({ targetId: p.id }), {
      icon: headFor(p.name), states: [p.id === target.id ? "SEL" : undefined, p.hasTag(ADMIN) ? "ADM" : undefined, "ON"],
    });
  }
  const tc = clan(target);
  s.text("SC", `§f${target.name}\n§7${tc ? `${tc.name} · ${tc.members[target.id].role === "coowner" ? "Co-owner" : tc.members[target.id].role === "owner" ? "Owner" : "Member"}` : "No clan"} · wallet ${fmtMoney(getBalance(target))}`, { icon: headFor(target.name) });
  for (const c of CATS) s.button("CAT", c.id === cat.id ? `§d${c.name}` : c.name, () => again({ cat: c.id, opt: undefined, n: undefined, optPage: 0 }), { icon: c.icon, states: [c.id === cat.id ? "ON" : undefined] });
  s.text("CH", cat.head);
  for (const [label, d] of cat.steps) s.button("STEP", label, () => again({ n: Math.max(0, n + d) }));
  s.button("STEP", "Type", async () => {
    const v = await askNumber(player, "Amount", cat.id === "money" ? "Amount ($)" : "How many?", n);
    return again({ n: v ?? n });
  });
  s.text("N", cat.id === "money" ? fmtMoney(n) : String(n));
  const who = target.name.toUpperCase();
  const giveText = !opt ? "NOTHING TO GIVE"
    : cat.id === "money" ? { give: `GIVE ${fmt(n)} TO ${who}`, take: `TAKE ${fmt(n)} FROM ${who}`, set: `SET ${who}'S WALLET TO ${fmt(n)}` }[opt.id]
    : cat.id === "heads" ? `GIVE ${n} × ${opt.name.toUpperCase()} HEADS TO ${who}`
    : cat.id === "kits" ? `GIVE ${n} × ${opt.name.toUpperCase()} TO ${who}`
    : `GIVE ${n} × ${opt.name.toUpperCase()} KEYS TO ${who}`;
  s.button("GIVE", giveText, () => {
    if (!opt || !target.isValid) return again({});
    let msg;
    if (cat.id === "money") {
      if (opt.id === "give") addMoney(target, n);
      else if (opt.id === "take") setBalance(target, Math.max(0, getBalance(target) - n));
      else setBalance(target, n);
      say(target, `An admin ${opt.id === "set" ? "set your balance to" : opt.id === "give" ? "gave you" : "took"} ${fmt(n)}.`);
      msg = `${opt.name}: ${fmt(n)} · ${target.name} now has ${fmt(getBalance(target))}`;
    } else if (cat.id === "heads") {
      addHeadPoints(target, opt.id, n);
      msg = `Gave ${n} ${opt.name} heads to ${target.name}.`;
    } else if (cat.id === "kits") {
      giveKit(target, opt.kit, Math.min(n, 64));
      say(target, `An admin gave you ${n}x ${opt.name}.`);
      msg = `Gave ${n}x ${opt.name} to ${target.name}.`;
    } else {
      giveKey(target, opt.id, Math.min(n, 640));
      msg = `Gave ${n}x ${opt.name} Key to ${target.name}.`;
    }
    say(player, msg);
    return again({});
  }, { states: [opt ? undefined : "OFF"] });
  s.text("LOCK", isAdmin ? "Admin player" : "Normal player", { states: [isAdmin ? "ADM" : undefined] });
  s.text("LOCKT", isAdmin
    ? "This player has the admin tag, so the tools below are unlocked for them."
    : "You can only give this player Money, Heads, Kits and Crate Keys. The options below only appear when the selected player has the admin tag, so you can't give them by accident.");
  const back = () => again({});
  const tools = [
    ["Custom Items", CB.star, () => customPanel(player, target)],
    ["Server Rules", CB.settings, () => rulesPanel(player, back)],
    ["Clans", CB.banner, () => clansPanel(player, back)],
    [`Force End Raid (${activeRaids().length})`, CB.stop, () => raidsPanel(player, back)],
    ["Clear Items", CB.bin, () => {
      const cleared = clearGroundItems();
      say(player, `Removed ${cleared} dropped item piles.`);
      return back();
    }],
    ["Economy Settings", CB.shop, () => ecoAdminMenu(player)],
  ];
  for (const [name, icon, run] of tools)
    s.button("TOOL", isAdmin ? `§f${name}` : `§8${name}`, isAdmin ? run : () => again({}), { icon, states: [isAdmin ? undefined : "OFF"] });
  await s.show(player);
}

async function customPanel(player, target) {
  const items = [
    { name: "Cloudbreak Menu", make: () => {
      const s = new ItemStack(CONFIG.menuItem.id, 1);
      s.lockMode = ItemLockMode.inventory;
      s.keepOnDeath = true;
      return s;
    } },
    { name: "Chunk Hopper", make: () => makeHopperItem(0, 0) },
    ...SPAWNERS.filter((s) => !s.disabled).map((s) => ({ name: `${s.name} Spawner`, make: () => makeSpawnerItem(s.mob, 1, 1) })),
  ];
  await tiles(player, "CUSTOM ITEMS", `§7Admin tag only. Give to ${target.name}:`, [
    ...items.map((it) => ({
      text: `§f${it.name}`,
      icon: CB.star,
      run: async () => {
        const n = await askNumber(player, it.name, "How many?", 1);
        if (!n) return customPanel(player, target);
        for (let i = 0; i < Math.min(n, 64); i++) giveStack(target, it.make());
        say(player, `Gave ${n}x ${it.name}.`);
        return adminPanel(player, { targetId: target.id });
      },
    })),
    back(() => adminPanel(player, { targetId: target.id })),
  ]);
}

// ---------------------------------------------------------------------------
// Server rules (saved, applied over the defaults in config.js)
// ---------------------------------------------------------------------------

const RULES = [
  ["Normal Raid price ($)", "raid.prices.normal", 1],
  ["Intel Raid price ($)", "raid.prices.intel", 1],
  ["Cheap Raid price ($)", "raid.prices.cheap", 1],
  ["Revenge Raid price ($)", "raid.prices.revenge", 1],
  ["Core tax per hour ($)", "core.taxPerHour", 1],
  ["Unpaid tax grace (minutes)", "core.graceMinutes", 1],
  ["Raid shield after a raid (hours)", "raid.immunityHours", 1],
  ["New clan protection (days)", "raid.newClanDays", 1],
  ["Bank stolen on a win (%)", "raid.bankStolen", 100],
  ["Underdog bonus (%)", "raid.underdogBonus", 100],
  ["Raid timer to bridge (minutes)", "raid.bridgeSeconds", 1 / 60],
  ["Loot time (minutes)", "raid.lootSeconds", 1 / 60],
  ["Raider lives", "raid.lives", 1],
];

const getPath = (path) => path.split(".").reduce((o, k) => o?.[k], CONFIG);
function setPath(path, v) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], CONFIG)[last] = v;
}

export function applySavedRules() {
  const saved = loadJson("cb:rules", {});
  for (const [path, v] of Object.entries(saved)) if (typeof v === "number" && getPath(path) !== undefined) setPath(path, v);
}

async function rulesPanel(player, goBack) {
  let form = new ModalFormData().title("Server Rules");
  for (const [label, path, scale] of RULES) form = form.textField(label, "a number", { defaultValue: String(Math.round(getPath(path) * scale * 100) / 100) });
  const res = await show(player, form);
  if (!res || res.canceled) return goBack();
  const saved = loadJson("cb:rules", {});
  const changed = [];
  RULES.forEach(([label, path, scale], i) => {
    const n = Number(String(res.formValues?.[i] ?? "").replace(/[$,%\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) return;
    const v = scale === 1 ? Math.floor(n) : n / scale;
    if (v !== getPath(path)) {
      setPath(path, v);
      saved[path] = v;
      changed.push(label);
    }
  });
  saveJson("cb:rules", saved);
  say(player, changed.length ? `Saved: ${changed.join(", ")}.` : "Nothing changed.");
  return goBack();
}

// ---------------------------------------------------------------------------
// Clans and raids
// ---------------------------------------------------------------------------

async function clansPanel(player, goBack) {
  const clans = allClans().sort((a, b) => a.name.localeCompare(b.name));
  await tiles(player, "CLANS", `§7${clans.length} clans.`, [
    ...clans.map((c) => ({
      text: `§f${c.name}`,
      sub: `§7${Object.keys(c.members).length} players · ${fmtMoney(bankOf(c))}`,
      icon: CB.banner,
      run: () => clanPanel(player, c.id, () => clansPanel(player, goBack)),
    })),
    back(goBack),
  ]);
}

async function clanPanel(player, clanId, goBack, msg) {
  const c = getClan(clanId);
  if (!c) return goBack();
  const st = c.stats ?? {};
  const members = Object.values(c.members).map((m) => `${m.name} (${m.role})`).join(", ");
  const ups = UPGRADES.map((u) => `${u.name} ${c.up?.[u.id] ?? 0}`).join(", ");
  await tiles(
    player,
    c.name.toUpperCase(),
    `${msg ? msg + "\n" : ""}§7Members §f${members}\n§7Bank §e${fmt(bankOf(c))}§7 · shield ${c.shieldDown ? "§cDOWN" : "§aUP"}\n§7Raids §f${st.wins ?? 0}W ${st.losses ?? 0}L ${st.defences ?? 0} defended\n§7Upgrades §f${ups}`,
    [
      { text: "§e§lSET BANK", icon: CB.bank, run: async () => {
        const n = await askNumber(player, "Clan bank", "New balance ($)", bankOf(c));
        if (n === undefined) return clanPanel(player, clanId, goBack);
        c.bank = n;
        saveClan(c);
        return clanPanel(player, clanId, goBack, `§aBank set to ${fmt(n)}.`);
      } },
      { text: "§c§lRESET CLAN", sub: "§7Bank, upgrades, insurance, stats, log", icon: CB.reset, run: async () => {
        const res = await show(player, new ModalFormData().title(`Reset ${c.name}?`).toggle("Yes, reset this clan's bank, upgrades, insurance, stats and raid log", { defaultValue: false }));
        if (!res?.formValues?.[0]) return clanPanel(player, clanId, goBack);
        Object.assign(c, { bank: 0, up: {}, insurance: 0, stats: undefined, log: [], ledger: [], spent: 0, shieldDown: false, owed: false, unpaidSince: undefined, immuneUntil: 0, revenge: undefined });
        if (c.island) c.island.size = CONFIG.island.startSize;
        saveClan(c);
        tellClan(c, "§cAn admin reset your clan's data.");
        return clanPanel(player, clanId, goBack, "§aClan reset.");
      } },
      back(goBack),
    ]
  );
}

async function raidsPanel(player, goBack) {
  const list = activeRaids();
  await tiles(player, "FORCE END RAID", list.length ? "§7Ending a raid pays nothing out. The attackers get their fee back." : "§7No raids are running.", [
    ...list.map((r) => {
      const s = raidStatus(r);
      return {
        text: `§c§l${s.attackerName} > ${s.targetName}`,
        sub: `§7${s.phase} · ${s.timeLeft} left`,
        icon: CB.stop,
        run: () => {
          forceEndRaid(r.id, true);
          say(player, "Raid ended.");
          return goBack();
        },
      };
    }),
    back(goBack),
  ]);
}

