import { ItemLockMode, ItemStack, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG, UPGRADES } from "./config.js";
import { allClans, getClan, saveClan, tellClan } from "./clans.js";
import { bankOf } from "./bank.js";
import { activeRaids, forceEndRaid, raidStatus } from "./raids.js";
import { giveKey } from "./after.js";
import { addMoney, fmt, fmtMoney, getBalance, setBalance } from "./eco/economy.js";
import { KITS, MINION_TYPES, SPAWNERS } from "./eco/config.js";
import { addHeadPoints, getHeadPoints, makeSpawnerItem } from "./eco/spawners.js";
import { adminMenu as ecoAdminMenu, giveKit } from "./eco/menus.js";
import { makeMinionItem } from "./eco/minions.js";
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
// Player list -> one player
// ---------------------------------------------------------------------------

export async function adminPanel(player) {
  if (!player.hasTag(ADMIN)) return say(player, "Only admins can open this.", false);
  const players = world.getPlayers().sort((a, b) => a.name.localeCompare(b.name));
  await tiles(
    player,
    "CONTROL ROOM",
    `§7Online §f${players.length}§7 · active raids §c${activeRaids().length}§7 · clans §f${allClans().length}\n§7Pick a player. §d[ADMIN]§7 players also show the admin-only tools.`,
    [
      ...players.map((p) => ({
        text: `§f${p.name}${p.hasTag(ADMIN) ? " §d[ADMIN]" : ""}`,
        sub: `§7${fmtMoney(getBalance(p))}`,
        icon: p.hasTag(ADMIN) ? CB.admin : CB.members,
        run: () => playerPanel(player, p),
      })),
    ]
  );
}

async function playerPanel(player, target, msg) {
  if (!target.isValid) return adminPanel(player);
  const isAdmin = target.hasTag(ADMIN);
  const reopen = (m) => playerPanel(player, target, m);
  const list = [
    { text: "§e§lMONEY", sub: "§7Give, take or set", icon: CB.sell, run: () => moneyPanel(player, target) },
    { text: "§f§lHEADS", sub: "§7Give or set", icon: CB.skull, run: () => headsPanel(player, target) },
    { text: "§6§lKITS", sub: "§7Pick a kit and amount", icon: CB.chest, run: () => kitsPanel(player, target) },
    { text: "§d§lCRATE KEYS", sub: "§7Pick a crate and amount", icon: CB.key, run: () => keysPanel(player, target) },
  ];
  if (isAdmin) {
    list.push(
      { text: "§5§lCUSTOM ITEMS", sub: "§7Admin tag only", icon: CB.star, run: () => customPanel(player, target) },
      { text: "§b§lSERVER RULES", sub: "§7Prices, tax, timers", icon: CB.settings, run: () => rulesPanel(player, () => reopen()) },
      { text: "§d§lCLANS", sub: "§7View, reset, delete", icon: CB.banner, run: () => clansPanel(player, () => reopen()) },
      { text: "§c§lFORCE END RAID", sub: `§7${activeRaids().length} running`, icon: CB.stop, run: () => raidsPanel(player, () => reopen()) },
      { text: "§c§lCLEAR ITEMS", sub: "§7Remove floor items", icon: CB.bin, run: () => {
        const n = clearGroundItems();
        return reopen(`§aRemoved ${n} dropped item piles.`);
      } },
      { text: "§e§lECONOMY SETTINGS", sub: "§7Shop editor, spawners, minions, NPCs", icon: CB.shop, run: () => ecoAdminMenu(player) }
    );
  }
  list.push(back(() => adminPanel(player)));
  await tiles(
    player,
    target.name.toUpperCase(),
    `${msg ? msg + "\n" : ""}§7${isAdmin ? "§dADMIN TAG §7· all tools" : "Normal player · Money, Heads, Kits and Crate Keys only"}\n§7Wallet §e${fmt(getBalance(target))}`,
    list
  );
}

// ---------------------------------------------------------------------------
// Money, heads, kits, keys
// ---------------------------------------------------------------------------

async function moneyPanel(player, target) {
  const modes = [["Give", "give"], ["Take", "take"], ["Set", "set"]];
  await tiles(player, "MONEY", `§7${target.name}: §e${fmt(getBalance(target))}`, [
    ...modes.map(([label, mode]) => ({
      text: `§l${label.toUpperCase()}`,
      icon: mode === "take" ? CB.no : CB.sell,
      run: async () => {
        const n = await askNumber(player, `${label} money`, `Amount to ${mode} ($)`);
        if (n === undefined) return moneyPanel(player, target);
        if (mode === "give") addMoney(target, n);
        else if (mode === "take") setBalance(target, Math.max(0, getBalance(target) - n));
        else setBalance(target, n);
        say(target, `An admin ${mode === "set" ? "set your balance to" : mode === "give" ? "gave you" : "took"} ${fmt(n)}.`);
        return playerPanel(player, target, `§a${label}: ${fmt(n)} · now ${fmt(getBalance(target))}`);
      },
    })),
    back(() => playerPanel(player, target)),
  ]);
}

async function headsPanel(player, target) {
  const mobs = SPAWNERS.filter((s) => !s.disabled);
  await tiles(player, "HEADS", `§7Pick a mob for ${target.name}.`, [
    ...mobs.map((s) => ({
      text: `§f${s.name}`,
      sub: `§7Has ${getHeadPoints(target, s.mob)}`,
      run: async () => {
        const res = await show(player, new ModalFormData().title(`${s.name} heads`).dropdown("Mode", ["Give", "Set"]).textField("Amount", "a number"));
        if (!res || res.canceled) return headsPanel(player, target);
        const mode = res.formValues?.[0];
        const n = Math.max(0, Math.floor(Number(res.formValues?.[1]) || 0));
        if (mode === 1) addHeadPoints(target, s.mob, n - getHeadPoints(target, s.mob));
        else addHeadPoints(target, s.mob, n);
        return playerPanel(player, target, `§a${s.name} heads: ${getHeadPoints(target, s.mob)}`);
      },
    })),
    back(() => playerPanel(player, target)),
  ]);
}

async function kitsPanel(player, target) {
  await tiles(player, "GIVE A KIT", `§7Pick a kit for ${target.name}.`, [
    ...KITS.filter((k) => !k.disabled).map((k) => ({
      text: `§6§l${k.name.toUpperCase()}`,
      sub: `§7${k.items.length} items`,
      icon: CB.chest,
      run: async () => {
        const n = await askNumber(player, k.name, "How many?", 1);
        if (!n) return kitsPanel(player, target);
        giveKit(target, k, Math.min(n, 64));
        say(target, `An admin gave you ${n}x ${k.name}.`);
        return playerPanel(player, target, `§aGave ${n}x ${k.name}.`);
      },
    })),
    back(() => playerPanel(player, target)),
  ]);
}

async function keysPanel(player, target) {
  await tiles(player, "GIVE CRATE KEYS", `§7Pick a crate for ${target.name}.`, [
    ...Object.entries(CONFIG.crates).map(([id, c]) => ({
      text: `${c.color}§l${c.name.toUpperCase()}`,
      icon: CB.key,
      run: async () => {
        const n = await askNumber(player, c.name, "How many keys?", 1);
        if (!n) return keysPanel(player, target);
        giveKey(target, id, Math.min(n, 640));
        return playerPanel(player, target, `§aGave ${n}x ${c.name} Key.`);
      },
    })),
    back(() => playerPanel(player, target)),
  ]);
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
    ...MINION_TYPES.map((t) => ({ name: `${t.name} (minion)`, make: () => makeMinionItem(0, {}, t.id) })),
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
        return playerPanel(player, target, `§aGave ${n}x ${it.name}.`);
      },
    })),
    back(() => playerPanel(player, target)),
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

