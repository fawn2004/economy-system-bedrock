import { ModalFormData } from "@minecraft/server-ui";
import { getCatalog } from "./catalog.js";
import { CONFIG, KITS, SPAWNERS, SPAWNER_SETTINGS as S } from "./config.js";
import { fmt } from "./economy.js";
import { container } from "./inventory.js";
import {
  SPAWNER_NUMBERS,
  SPAWNER_SWITCHES,
  defaultsFor,
  resetAllSettings,
  resetSection,
  saveKits,
  setConfig,
  setLevels,
  setMob,
  setSpawner,
} from "./settings.js";
import { mobIcon } from "./spawners.js";
import { ICON, backTile, fail, pagedMenu, showForm, success, tileMenu } from "./ui.js";

// ============================================================================
//  ADMIN > SETTINGS   (edit the whole pack in-game)
// ============================================================================

const isAdmin = (p) => p.hasTag(CONFIG.adminTag);
const clip = (s, n = 18) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const pretty = (id) => id.replace(/^minecraft:/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Parses a whole number >= min from a text field, else undefined. */
function num(v, min = 0, decimals = false) {
  const n = Number(String(v).replace(/[,$%\s]/g, ""));
  if (!Number.isFinite(n) || n < min) return undefined;
  return decimals ? Math.round(n * 100) / 100 : Math.floor(n);
}

async function modal(player, title, build) {
  const form = new ModalFormData().title(title);
  build(form);
  const res = await showForm(player, form);
  return res && !res.canceled ? res.formValues : undefined;
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

// ---------------------------------------------------------------------------
export async function settingsMenu(player, back, msg) {
  if (!isAdmin(player)) return;
  const reopen = (m) => settingsMenu(player, back, m);
  await tileMenu(player, {
    title: "SETTINGS",
    theme: "red",
    body:
      (msg ? msg + "\n" : "") +
      "§7Change how the pack works. Saved in this world.\n§8Shop items & prices: use Admin > Shop Editor.",
    tiles: [
      { text: "§b§lSPAWNERS", sub: "§7Upgrades & rules", icon: "textures/ui/eco/icon_spawners", onClick: () => spawnerSettings(player, () => reopen()) },
      { text: "§e§lKITS", sub: `§7${KITS.length} kits`, icon: "textures/ui/eco/icon_kits", onClick: () => kitsSettings(player, () => reopen()) },
      { text: "§a§lECONOMY", sub: "§7Money & menus", icon: ICON.bank, onClick: () => economyForm(player, reopen) },
      {
        text: "§4§lRESET ALL",
        sub: "§7Back to defaults",
        icon: ICON.cancel,
        onClick: () =>
          confirm(player, "RESET ALL SETTINGS?", "§7Spawner, kit and economy settings go back to the add-on defaults.\n§8(Shop Editor edits are not touched.)", () => {
            resetAllSettings();
            success(player, "All settings were reset to defaults.");
            return reopen("§aAll settings were reset.");
          }, () => reopen()),
      },
      backTile(back),
    ],
  });
}

// ---- economy ----------------------------------------------------------------
async function economyForm(player, reopen) {
  const v = await modal(player, "Economy settings", (f) =>
    f
      .textField("Starting money for new players", "500", { defaultValue: String(CONFIG.startingBalance) })
      .textField("Currency symbol", "$", { defaultValue: CONFIG.currency })
      .textField("Items per shop page (8-40)", "20", { defaultValue: String(CONFIG.pageSize) })
      .toggle("Give the menu compass when players join", { defaultValue: CONFIG.compass.giveOnJoin })
  );
  if (!v) return reopen();
  const start = num(v[0]);
  const page = num(v[2], 8);
  const currency = String(v[1]).trim().slice(0, 3);
  if (start === undefined || page === undefined || !currency) return reopen("§cCheck the numbers and try again.");
  setConfig({ startingBalance: start, currency, pageSize: Math.min(40, page), giveOnJoin: !!v[3] });
  success(player, "Economy settings saved.");
  return reopen("§aEconomy settings saved.");
}

// ---- spawners -----------------------------------------------------------------
async function spawnerSettings(player, back, msg) {
  const reopen = (m) => spawnerSettings(player, back, m);
  const enabled = SPAWNERS.filter((s) => !s.disabled).length;
  await tileMenu(player, {
    title: "SPAWNER SETTINGS",
    theme: "red",
    body:
      (msg ? msg + "\n" : "") +
      `§7Levels: §f${S.levels.length}   §7Stack limit: §f${S.maxStack}   §7Mob stack limit: §f${S.maxMobStack || "none"}\n` +
      `§7Cost x stack: §f${S.costTimesStack === false ? "off" : "on"}   §7Freeze mobs: §f${S.freezeMobs ? "on" : "off"}`,
    tiles: [
      { text: "§d§lLEVELS", sub: "§7Cost, chance, speed", icon: ICON.top, onClick: () => levelsMenu(player, () => reopen()) },
      { text: "§b§lRULES", sub: "§7Stacking & more", icon: ICON.admin, onClick: () => spawnerRulesForm(player, reopen) },
      { text: "§e§lMOB PRICES", sub: `§7${enabled}/${SPAWNERS.length} in shop`, icon: ICON.coin, onClick: () => mobPricesMenu(player, () => reopen()) },
      {
        text: "§4§lRESET",
        sub: "§7Spawner defaults",
        icon: ICON.cancel,
        onClick: () =>
          confirm(player, "RESET SPAWNERS?", "§7Levels, rules and mob prices go back to the defaults.", () => {
            resetSection("spawner");
            resetSection("mobs");
            success(player, "Spawner settings reset.");
            return reopen("§aSpawner settings reset to defaults.");
          }, () => reopen()),
      },
      backTile(back),
    ],
  });
}

async function spawnerRulesForm(player, reopen) {
  const v = await modal(player, "Spawner rules", (f) => {
    for (const [k, label] of SPAWNER_NUMBERS) f.textField(label, String(S[k]), { defaultValue: String(S[k]) });
    for (const [k, label] of SPAWNER_SWITCHES) f.toggle(label, { defaultValue: S[k] !== false });
  });
  if (!v) return reopen();
  const changes = {};
  for (const [i, [k, label, min]] of SPAWNER_NUMBERS.entries()) {
    const n = num(v[i], min);
    if (n === undefined) return reopen(`§c"${label}" must be a whole number of at least ${min}.`);
    changes[k] = n;
  }
  for (const [i, [k]] of SPAWNER_SWITCHES.entries()) changes[k] = !!v[SPAWNER_NUMBERS.length + i];
  setSpawner(changes);
  success(player, "Spawner rules saved.");
  return reopen("§aSpawner rules saved.");
}

function levelsMenu(player, back, msg) {
  const reopen = (m) => levelsMenu(player, back, m);
  const tiles = S.levels.map((l, i) => ({
    text: `§6§lLEVEL ${i + 1}`,
    sub: `§d${l.headChance}% §7${l.interval}s`,
    icon: ICON.top,
    onClick: () => levelForm(player, i, reopen),
  }));
  tiles.push({
    text: "§a§lADD LEVEL",
    sub: `§7Level ${S.levels.length + 1}`,
    icon: ICON.confirm,
    onClick: () => {
      const last = S.levels[S.levels.length - 1];
      setLevels([...S.levels, { interval: Math.max(1, last.interval - 1), headChance: Math.min(100, last.headChance + 2.5), cost: Math.round(last.cost * 1.4) }]);
      return levelForm(player, S.levels.length - 1, reopen);
    },
  });
  if (S.levels.length > 1) {
    tiles.push({
      text: "§c§lREMOVE LAST",
      sub: `§7Level ${S.levels.length}`,
      icon: ICON.cancel,
      onClick: () =>
        confirm(player, `REMOVE LEVEL ${S.levels.length}?`, "§7Spawners above the new max level will work as the new max level.", () => {
          setLevels(S.levels.slice(0, -1));
          return reopen(`§aRemoved level ${S.levels.length + 1}.`);
        }, () => reopen()),
    });
  }
  const costNote = S.costTimesStack === false ? "" : " §8(x the spawner's stack size)";
  return pagedMenu(player, {
    title: "SPAWNER LEVELS",
    theme: "red",
    body:
      (msg ? msg + "\n" : "") +
      `§7Tap a level to change its §dhead chance§7, §fspawn speed §7and §6head cost${costNote}§7.\n` +
      S.levels.map((l, i) => `§6${i + 1}§7: ${l.headChance}% / ${l.interval}s${i ? ` / ${l.cost} heads` : ""}`).join("  "),
    tiles,
    back,
  });
}

async function levelForm(player, i, reopen) {
  const l = S.levels[i];
  const v = await modal(player, `Spawner level ${i + 1}`, (f) => {
    f.textField("Head drop chance (%) - e.g. 10 = 1 in 10 kills", String(l.headChance), { defaultValue: String(l.headChance) });
    f.textField("Seconds between spawns", String(l.interval), { defaultValue: String(l.interval) });
    if (i > 0) f.textField(`Heads needed to upgrade from level ${i} to ${i + 1}`, String(l.cost), { defaultValue: String(l.cost) });
  });
  if (!v) return reopen();
  const chance = num(v[0], 0, true);
  const interval = num(v[1], 1);
  const cost = i > 0 ? num(v[2], 0) : 0;
  if (chance === undefined || chance > 100 || interval === undefined || cost === undefined) {
    fail(player, "Chance must be 0-100, seconds at least 1 and cost 0 or more.");
    return reopen("§cChance must be 0-100, seconds at least 1, cost 0 or more.");
  }
  const levels = S.levels.map((x) => ({ ...x }));
  levels[i] = { headChance: chance, interval, cost };
  setLevels(levels);
  success(player, `Level ${i + 1}: ${chance}% heads, every ${interval}s${i ? `, ${cost} heads` : ""}.`);
  return reopen(`§aLevel ${i + 1} saved.`);
}

function mobPricesMenu(player, back, msg) {
  const reopen = (m) => mobPricesMenu(player, back, m);
  const tiles = SPAWNERS.map((sp) => ({
    text: `${sp.disabled ? "§c" : "§f"}${clip(sp.name)}`,
    sub: sp.disabled ? "§cNot sold" : `§a${fmt(sp.price)}`,
    icon: mobIcon(sp.mob),
    onClick: async () => {
      const v = await modal(player, `${sp.name} Spawner`, (f) =>
        f
          .textField(`Price (default ${fmt(defaultsFor("mobs")[sp.mob]?.price ?? sp.price)})`, String(sp.price), { defaultValue: String(sp.price) })
          .toggle("Sold in the shop", { defaultValue: !sp.disabled })
      );
      if (!v) return reopen();
      const price = num(v[0], 1);
      if (price === undefined) return reopen("§cThe price must be a whole number above 0.");
      setMob(sp.mob, { price, disabled: !v[1] });
      success(player, `${sp.name} Spawner: ${fmt(price)}${v[1] ? "" : " (not sold)"}.`);
      return reopen(`§a${sp.name} Spawner saved.`);
    },
  }));
  return pagedMenu(player, { title: "SPAWNER PRICES", theme: "red", body: (msg ? msg + "\n" : "") + "§7Tap a mob to change its price or hide it from the shop.", tiles, back });
}

// ---- kits ------------------------------------------------------------------------
const formatTime = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${sec}s`;
};

function kitsSettings(player, back, msg) {
  const reopen = (m) => kitsSettings(player, back, m);
  const tiles = KITS.map((k, i) => ({
    text: `${k.disabled ? "§c" : "§f"}${clip(k.name)}`,
    sub: k.disabled ? "§cHidden" : `§a${fmt(k.price)} §7${formatTime(k.cooldown ?? 0)}`,
    icon: k.icon,
    onClick: () => kitMenu(player, i, () => reopen()),
  }));
  tiles.push({ text: "§a§lNEW KIT", sub: "§7From your items", icon: ICON.confirm, onClick: () => newKit(player, reopen) });
  tiles.push({
    text: "§4§lRESET",
    sub: "§7Default kits",
    icon: ICON.cancel,
    onClick: () =>
      confirm(player, "RESET KITS?", "§7All kits go back to the add-on's default kits.", () => {
        resetSection("kits");
        return reopen("§aKits reset to defaults.");
      }, () => reopen()),
  });
  return pagedMenu(player, { title: "KIT SETTINGS", theme: "purple", body: (msg ? msg + "\n" : "") + "§7Tap a kit to edit it.", tiles, back });
}

async function kitMenu(player, i, back, msg) {
  const k = KITS[i];
  if (!k) return back();
  const reopen = (m) => kitMenu(player, i, back, m);
  const contents = k.items.map((it) => `${it.amount > 1 ? it.amount + "x " : ""}${it.name ?? pretty(it.id)}${it.enchants && Object.keys(it.enchants).length ? " §d*" : "§f"}`).join("§7, §f");
  await tileMenu(player, {
    title: `KIT: ${clip(k.name.toUpperCase(), 18)}`,
    theme: "purple",
    body:
      (msg ? msg + "\n" : "") +
      `§f${k.name}${k.disabled ? " §c(hidden)" : ""}\n§7Price: §a${fmt(k.price)}   §7Cooldown: §f${formatTime(k.cooldown ?? 0)}\n§7Contains: §f${contents || "nothing"}\n§8§d*§8 = enchanted`,
    tiles: [
      { text: "§e§lEDIT", sub: "§7Name, price, time", icon: ICON.admin, onClick: () => kitForm(player, i, reopen) },
      {
        text: "§b§lSET ITEMS",
        sub: "§7From your inventory",
        icon: ICON.shop,
        onClick: () =>
          confirm(player, "SET KIT ITEMS?", `§7The kit will contain everything in your inventory right now\n§7(except the menu compass), including enchantments and names.`, () => {
            const items = readInventory(player);
            if (!items.length) return reopen("§cYour inventory is empty - put the kit's items in it first.");
            k.items = items;
            k.icon = iconFor(items[0].id) ?? k.icon;
            saveKits();
            success(player, `${k.name} now has ${items.length} item stacks.`);
            return reopen(`§aSaved ${items.length} item stacks.`);
          }, () => reopen()),
      },
      {
        text: "§c§lDELETE",
        sub: "§7Remove kit",
        icon: ICON.cancel,
        onClick: () =>
          confirm(player, `DELETE ${clip(k.name.toUpperCase(), 14)}?`, "§7This kit will be removed from the shop.", () => {
            KITS.splice(i, 1);
            saveKits();
            success(player, `${k.name} was deleted.`);
            return back();
          }, () => reopen()),
      },
      backTile(back),
    ],
  });
}

async function kitForm(player, i, reopen) {
  const k = KITS[i];
  const v = await modal(player, `Edit ${k.name}`, (f) =>
    f
      .textField("Kit name", k.name, { defaultValue: k.name })
      .textField("Price", String(k.price), { defaultValue: String(k.price) })
      .textField("Cooldown in minutes (0 = none)", String(Math.round((k.cooldown ?? 0) / 60)), { defaultValue: String(Math.round((k.cooldown ?? 0) / 60)) })
      .toggle("Show in the shop", { defaultValue: !k.disabled })
      .toggle("NEW! badge", { defaultValue: k.badge === "NEW" })
  );
  if (!v) return reopen();
  const name = String(v[0]).trim().slice(0, 24);
  const price = num(v[1], 0);
  const minutes = num(v[2], 0);
  if (!name || price === undefined || minutes === undefined) return reopen("§cCheck the name and numbers and try again.");
  Object.assign(k, { name, price, cooldown: minutes * 60, disabled: !v[3], badge: v[4] ? "NEW" : undefined });
  saveKits();
  success(player, `${name} saved.`);
  return reopen(`§a${name} saved.`);
}

async function newKit(player, reopen) {
  const items = readInventory(player);
  if (!items.length) {
    fail(player, "Put the kit's items in your inventory first, then press NEW KIT.");
    return reopen("§cPut the kit's items in your inventory first.");
  }
  const v = await modal(player, "New kit", (f) =>
    f
      .textField(`Kit name  §8(${items.length} item stacks from your inventory)`, "e.g. PvP Kit")
      .textField("Price", "1000", { defaultValue: "1000" })
      .textField("Cooldown in minutes (0 = none)", "60", { defaultValue: "60" })
  );
  if (!v) return reopen();
  const name = String(v[0]).trim().slice(0, 24);
  const price = num(v[1], 0);
  const minutes = num(v[2], 0);
  if (!name || price === undefined || minutes === undefined) return reopen("§cCheck the name and numbers and try again.");
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + Date.now().toString(36);
  KITS.push({ id, name, icon: iconFor(items[0].id) ?? "textures/ui/eco/icon_kits", price, cooldown: minutes * 60, badge: "NEW", items });
  saveKits();
  success(player, `Created ${name} with ${items.length} item stacks.`);
  return reopen(`§aCreated §f${name}§a.`);
}

/** Inventory -> kit item list (skips the menu compass and shop-tagged items). */
function readInventory(player) {
  const inv = container(player);
  const out = [];
  if (!inv) return out;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!it || it.typeId === "eco:menu_compass") continue;
    const entry = { id: it.typeId };
    if (it.amount > 1) entry.amount = it.amount;
    if (it.nameTag) entry.name = it.nameTag;
    try {
      const ench = it.getComponent("minecraft:enchantable")?.getEnchantments() ?? [];
      if (ench.length) entry.enchants = Object.fromEntries(ench.map((e) => [e.type.id.replace(/^minecraft:/, ""), e.level]));
    } catch {}
    out.push(entry);
  }
  return out;
}

const iconFor = (id) => getCatalog().all.get(id)?.icon;
