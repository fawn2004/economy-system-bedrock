import { ModalFormData } from "@minecraft/server-ui";
import { getCatalog } from "./catalog.js";
import { COLLECTION_TIERS, CONFIG, CROPS, KITS, MINION_SETTINGS, MINION_TIERS, MINION_UPGRADES, SKILLS, SKILL_SETTINGS, SKILL_TOOLS, SPAWNERS, SPAWNER_SETTINGS as S, TOOL_LEVELS, TOOL_UPGRADES } from "./config.js";
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
  setCollections,
  setMinionSettings,
  setMinionTiers,
  setMinionUpgrades,
  setMob,
  setSkill,
  setSkillSettings,
  setSpawner,
  setTool,
  setToolLevels,
  setUpgrades,
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
      { text: "§6§lSKILL TOOLS", sub: "§7Hoe, sword, upgrades", icon: "textures/items/diamond_hoe", onClick: () => skillToolsSettings(player, () => reopen()) },
      { text: "§d§lCOLLECTIONS", sub: "§7Tiers & rewards", icon: "textures/ui/eco/icon_farming", onClick: () => collectionsSettings(player, () => reopen()) },
      { text: "§b§lSKILLS", sub: "§7XP, perks, rewards", icon: "textures/items/iron_pickaxe", onClick: () => skillsSettings(player, () => reopen()) },
      { text: "§e§lMINIONS", sub: "§7Price, upgrades, tiers", icon: "textures/ui/eco/icon_minion", onClick: () => minionSettings(player, () => reopen()) },
      { text: "§a§lECONOMY", sub: "§7Money & menus", icon: ICON.bank, onClick: () => economyForm(player, reopen) },
      {
        text: "§6§lFLOOR ITEMS",
        sub: CONFIG.itemStacking.enabled ? "§aStacking on" : "§cStacking off",
        icon: ICON.coin,
        onClick: () => floorItemsForm(player, reopen),
      },
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
      .toggle("Search / Next / Back in a centred row at the top of lists", { defaultValue: CONFIG.centerNav })
  );
  if (!v) return reopen();
  const start = num(v[0]);
  const page = num(v[2], 8);
  const currency = String(v[1]).trim().slice(0, 3);
  if (start === undefined || page === undefined || !currency) return reopen("§cCheck the numbers and try again.");
  setConfig({ startingBalance: start, currency, pageSize: Math.min(40, page), giveOnJoin: !!v[3], centerNav: !!v[4] });
  success(player, "Economy settings saved.");
  return reopen("§aEconomy settings saved.");
}

// ---- dropped items --------------------------------------------------------------
async function floorItemsForm(player, reopen) {
  const c = CONFIG.itemStacking;
  const v = await modal(player, "Floor items", (f) =>
    f
      .toggle("Merge dropped stackable items into piles (less lag)", { defaultValue: c.enabled })
      .textField("Merge distance (blocks, 1-16)", String(c.radius), { defaultValue: String(c.radius) })
      .toggle('Show the count above piles (e.g. "Bone x500")', { defaultValue: c.showCount })
  );
  if (!v) return reopen();
  const radius = num(v[1], 1);
  if (radius === undefined) return reopen("§cThe merge distance must be a whole number.");
  setConfig({ itemStacking: { enabled: !!v[0], radius: Math.min(16, radius), showCount: !!v[2] } });
  success(player, "Floor item settings saved.");
  return reopen("§aFloor item settings saved.");
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

// ---- skill tools ----------------------------------------------------------------
const ENCHANT_MAX = { sharpness: 5, looting: 3, fire_aspect: 2, fortune: 3, efficiency: 5, smite: 5, knockback: 2, unbreaking: 3 };
const list = (arr) => arr.join(", ");
function parseList(v) {
  const out = String(v).split(/[,\s]+/).filter(Boolean).map((x) => num(x, 0));
  return out.length && out.every((x) => x !== undefined) ? out : undefined;
}

function skillToolsSettings(player, back, msg) {
  const reopen = (m) => skillToolsSettings(player, back, m);
  const tiles = Object.entries(SKILL_TOOLS).map(([kind, t]) => ({
    text: `§6§l${t.name.toUpperCase()}`,
    sub: `§a${fmt(t.price)} §7${(TOOL_UPGRADES[kind] ?? []).length} upgr.`,
    icon: t.icon,
    onClick: () => toolSettings(player, kind, () => reopen()),
  }));
  tiles.push({ text: "§b§lTOOL LEVELS", sub: "§7XP & unlocks", icon: ICON.top, onClick: () => toolLevelsMenu(player, () => reopen()) });
  tiles.push({
    text: "§4§lRESET",
    sub: "§7Tool defaults",
    icon: ICON.cancel,
    onClick: () =>
      confirm(player, "RESET SKILL TOOLS?", "§7Tool stats, upgrades and tool levels go back to the defaults.\n§8(Tools players already own keep their upgrades.)", () => {
        resetSection("tools");
        resetSection("upgrades");
        resetSection("toolLevels");
        return reopen("§aSkill tools reset to defaults.");
      }, () => reopen()),
  });
  tiles.push(backTile(back));
  return tileMenu(player, { title: "SKILL TOOL SETTINGS", theme: "gold", body: (msg ? msg + "\n" : "") + "§7Pick a tool to change its stats and upgrades.", tiles });
}

function toolSettings(player, kind, back, msg) {
  const t = SKILL_TOOLS[kind];
  const reopen = (m) => toolSettings(player, kind, back, m);
  const extra =
    kind === "farming"
      ? `§7Auto-replant from level: §f${t.replantLevel}   §7Enchanted crop chance: §a${t.enchantedChance ?? 0}% §7(+${t.enchantedPerLevel ?? 0}%/lv)`
      : `§7Head chance per level: §d+${t.headBonusPerLevel}%`;
  return tileMenu(player, {
    title: t.name.toUpperCase(),
    theme: "gold",
    body:
      (msg ? msg + "\n" : "") +
      `§7Price: §a${fmt(t.price)}   §7XP per use: §b${t.xpPerUse}   §7Bonus drops per level: §a+${t.bonusPerLevel}%\n${extra}`,
    tiles: [
      { text: "§e§lGENERAL", sub: "§7Price, XP, bonus", icon: ICON.admin, onClick: () => toolForm(player, kind, reopen) },
      { text: "§d§lUPGRADES", sub: `§7${(TOOL_UPGRADES[kind] ?? []).length} upgrades`, icon: ICON.top, onClick: () => upgradesMenu(player, kind, () => reopen()) },
      backTile(back),
    ],
  });
}

async function toolForm(player, kind, reopen) {
  const t = SKILL_TOOLS[kind];
  const v = await modal(player, `${t.name} settings`, (f) => {
    f.textField("Name", t.name, { defaultValue: t.name });
    f.textField("Shop price", String(t.price), { defaultValue: String(t.price) });
    f.textField(kind === "farming" ? "XP per fully grown crop" : "XP per mob kill", String(t.xpPerUse), { defaultValue: String(t.xpPerUse) });
    f.textField("Bonus drop chance per tool level (%)", String(t.bonusPerLevel), { defaultValue: String(t.bonusPerLevel) });
    if (kind === "farming") f.textField("Auto-replant from tool level", String(t.replantLevel), { defaultValue: String(t.replantLevel) });
    else f.textField("Extra head chance per tool level (%)", String(t.headBonusPerLevel), { defaultValue: String(t.headBonusPerLevel) });
    if (kind === "farming") {
      f.textField("Enchanted crop drop chance (%) - any tool", String(t.enchantedChance ?? 0), { defaultValue: String(t.enchantedChance ?? 0) });
      f.textField("Extra enchanted crop chance per hoe level (%)", String(t.enchantedPerLevel ?? 0), { defaultValue: String(t.enchantedPerLevel ?? 0) });
    }
  });
  if (!v) return reopen();
  const name = String(v[0]).trim().slice(0, 24);
  const price = num(v[1], 0), xp = num(v[2], 1), bonus = num(v[3], 0, true), last = num(v[4], 0, true);
  if (!name || [price, xp, bonus, last].some((x) => x === undefined)) return reopen("§cCheck the numbers and try again.");
  let extra = {};
  if (kind === "farming") {
    const ch = num(v[5], 0, true), per = num(v[6], 0, true);
    if (ch === undefined || per === undefined || ch > 100) return reopen("§cEnchanted chance must be 0-100.");
    extra = { enchantedChance: ch, enchantedPerLevel: per };
  }
  setTool(kind, { name, price, xpPerUse: xp, bonusPerLevel: bonus, ...extra, ...(kind === "farming" ? { replantLevel: Math.max(1, Math.floor(last)) } : { headBonusPerLevel: last }) });
  success(player, `${name} saved.`);
  return reopen(`§a${name} saved.`);
}

function upgradesMenu(player, kind, back, msg) {
  const reopen = (m) => upgradesMenu(player, kind, back, m);
  const ups = TOOL_UPGRADES[kind] ?? [];
  const tiles = ups.map((u, i) => ({
    text: `${u.disabled ? "§c" : "§e"}§l${clip(u.name.toUpperCase(), 14)}`,
    sub: u.disabled ? "§cOff" : `§7Max ${u.max} §d${clip(u.crop ? cropNameOf(u.crop) : mobNameOf(u.headMob), 9)}`,
    icon: u.icon,
    onClick: () => upgradeForm(player, kind, i, reopen),
  }));
  tiles.push({
    text: "§4§lRESET",
    sub: "§7Default upgrades",
    icon: ICON.cancel,
    onClick: () =>
      confirm(player, "RESET UPGRADES?", `§7${SKILL_TOOLS[kind].name} upgrades go back to the defaults.`, () => {
        const defaults = defaultsFor("upgrades");
        setUpgrades(kind, defaults[kind] ?? []);
        return reopen("§aUpgrades reset to defaults.");
      }, () => reopen()),
  });
  return tileMenu(player, {
    title: `${SKILL_TOOLS[kind].name.toUpperCase()} UPGRADES`,
    theme: "gold",
    body: (msg ? msg + "\n" : "") + "§7Tap an upgrade to change its costs, head mob, bonus or turn it off.",
    tiles: [...tiles, backTile(back)],
  });
}

const mobNameOf = (mob) => SPAWNERS.find((s) => s.mob === mob)?.name ?? mob;
const cropNameOf = (id) => CROPS.find((c) => c.id === id)?.name ?? id;

async function upgradeForm(player, kind, i, reopen) {
  const u = TOOL_UPGRADES[kind][i];
  // the hoe is paid with enchanted crops, the sword with mob heads
  const useCrops = kind === "farming" || !!u.crop;
  const options = useCrops ? CROPS.map((c) => `Enchanted ${c.name}`) : SPAWNERS.map((s) => `${s.name} heads`);
  const curIdx = Math.max(0, useCrops ? CROPS.findIndex((c) => c.id === u.crop) : SPAWNERS.findIndex((s) => s.mob === u.headMob));
  const v = await modal(player, `Upgrade: ${u.name}`, (f) => {
    f.textField("Name", u.name, { defaultValue: u.name });
    f.textField("Description", u.desc ?? "", { defaultValue: u.desc ?? "" });
    f.dropdown("Also costs", options, { defaultValueIndex: curIdx });
    f.textField(`Money cost for each level, comma separated${u.enchant ? ` (max ${ENCHANT_MAX[u.enchant] ?? 5} levels)` : ""}`, list(u.money), { defaultValue: list(u.money) });
    f.textField(`${useCrops ? "Enchanted crop" : "Head"} cost for each level (same number of levels)`, list(u.heads), { defaultValue: list(u.heads) });
    if (!u.enchant) f.textField("Bonus per level (% or levels)", String(u.perLevel ?? 0), { defaultValue: String(u.perLevel ?? 0) });
    f.toggle("Enabled (shown in the upgrade menu)", { defaultValue: !u.disabled });
  });
  if (!v) return reopen();
  const name = String(v[0]).trim().slice(0, 20);
  const desc = String(v[1]).trim().slice(0, 50);
  const money = parseList(v[3]), heads = parseList(v[4]);
  const perLevel = u.enchant ? undefined : num(v[5], 0, true);
  const enabled = !!v[u.enchant ? 5 : 6];
  if (!name || !money || !heads || money.length !== heads.length || (!u.enchant && perLevel === undefined)) {
    fail(player, "Money and head costs must be lists of numbers with the same number of levels.");
    return reopen("§cMoney and head costs need the same number of levels (e.g. 1000, 5000, 20000).");
  }
  const maxLv = u.enchant ? Math.min(money.length, ENCHANT_MAX[u.enchant] ?? 5) : money.length;
  const next = TOOL_UPGRADES[kind].map((x) => ({ ...x }));
  next[i] = {
    ...u, name, desc,
    ...(useCrops ? { crop: CROPS[v[2]]?.id ?? u.crop, headMob: undefined } : { headMob: SPAWNERS[v[2]]?.mob ?? u.headMob, crop: undefined }),
    money: money.slice(0, maxLv), heads: heads.slice(0, maxLv), max: maxLv,
    ...(u.enchant ? {} : { perLevel }), disabled: !enabled,
  };
  setUpgrades(kind, next);
  success(player, `${name} saved (${maxLv} levels).`);
  return reopen(`§a${name} saved - ${maxLv} levels.`);
}

function toolLevelsMenu(player, back, msg) {
  const reopen = (m) => toolLevelsMenu(player, back, m);
  const L = TOOL_LEVELS;
  const tiles = L.xpNeeded.map((xp, i) => ({
    text: `§6§lLEVEL ${i + 1}`,
    sub: `§b${xp}xp${i + 1 > L.freeLevels ? ` §7${L.collectionNeeded[i] ?? 0}` : ""}`,
    icon: ICON.top,
    onClick: () => toolLevelForm(player, i, reopen),
  }));
  tiles.push({
    text: "§a§lFREE LEVELS",
    sub: `§7Lv 1-${L.freeLevels}`,
    icon: ICON.confirm,
    onClick: async () => {
      const v = await modal(player, "Free tool levels", (f) =>
        f.textField("Levels that only need XP (no collection needed)", String(L.freeLevels), { defaultValue: String(L.freeLevels) })
      );
      if (!v) return reopen();
      const n = num(v[0], 1);
      if (n === undefined) return reopen("§cEnter a whole number.");
      setToolLevels({ freeLevels: Math.min(n, L.xpNeeded.length) });
      return reopen(`§aLevels 1-${Math.min(n, L.xpNeeded.length)} now only need XP.`);
    },
  });
  return pagedMenu(player, {
    title: "TOOL LEVELS",
    theme: "gold",
    body:
      (msg ? msg + "\n" : "") +
      `§7XP a tool needs for each level, and (above level ${L.freeLevels}) the total collection needed\n§8(all crops for the hoe, all mob kills for the sword).`,
    tiles,
    back,
  });
}

async function toolLevelForm(player, i, reopen) {
  const L = TOOL_LEVELS;
  const v = await modal(player, `Tool level ${i + 1}`, (f) => {
    if (i > 0) f.textField("Total XP needed for this level", String(L.xpNeeded[i]), { defaultValue: String(L.xpNeeded[i]) });
    f.textField(`Collection needed${i + 1 <= L.freeLevels ? " (only used above the free levels)" : ""}`, String(L.collectionNeeded[i] ?? 0), { defaultValue: String(L.collectionNeeded[i] ?? 0) });
  });
  if (!v) return reopen();
  const xp = i > 0 ? num(v[0], 1) : 0;
  const col = num(v[i > 0 ? 1 : 0], 0);
  if (xp === undefined || col === undefined) return reopen("§cEnter whole numbers.");
  const xpNeeded = [...L.xpNeeded], collectionNeeded = [...L.collectionNeeded];
  xpNeeded[i] = xp;
  collectionNeeded[i] = col;
  setToolLevels({ xpNeeded, collectionNeeded });
  success(player, `Tool level ${i + 1}: ${xp} XP, ${col} collection.`);
  return reopen(`§aLevel ${i + 1} saved.`);
}

// ---- collections -------------------------------------------------------------------
function collectionsSettings(player, back, msg) {
  const reopen = (m) => collectionsSettings(player, back, m);
  const C = COLLECTION_TIERS;
  const tiles = C.amounts.map((a, i) => ({
    text: `§6§lTIER ${i + 1}`,
    sub: `§7${a} §a${fmt(C.rewards[i] ?? 0)}`,
    icon: ICON.top,
    onClick: async () => {
      const v = await modal(player, `Collection tier ${i + 1}`, (f) =>
        f
          .textField("Amount needed (crops harvested / mobs killed)", String(a), { defaultValue: String(a) })
          .textField("Money reward (paid once)", String(C.rewards[i] ?? 0), { defaultValue: String(C.rewards[i] ?? 0) })
      );
      if (!v) return reopen();
      const amount = num(v[0], 1), reward = num(v[1], 0);
      if (amount === undefined || reward === undefined) return reopen("§cEnter whole numbers.");
      const amounts = [...C.amounts], rewards = [...C.rewards];
      amounts[i] = amount;
      rewards[i] = reward;
      setCollections({ amounts, rewards });
      return reopen(`§aTier ${i + 1} saved.`);
    },
  }));
  tiles.push({
    text: "§a§lADD TIER",
    sub: `§7Tier ${C.amounts.length + 1}`,
    icon: ICON.confirm,
    onClick: () => {
      setCollections({ amounts: [...C.amounts, (C.amounts.at(-1) ?? 100) * 4], rewards: [...C.rewards, (C.rewards.at(-1) ?? 500) * 3] });
      return reopen(`§aAdded tier ${C.amounts.length}. Tap it to set its numbers.`);
    },
  });
  if (C.amounts.length > 1) {
    tiles.push({
      text: "§c§lREMOVE LAST",
      sub: `§7Tier ${C.amounts.length}`,
      icon: ICON.cancel,
      onClick: () => {
        setCollections({ amounts: C.amounts.slice(0, -1), rewards: C.rewards.slice(0, -1) });
        return reopen("§aRemoved the last tier.");
      },
    });
  }
  tiles.push({
    text: "§d§lBONUS",
    sub: `§a+${C.bonusPerTier}% §7/tier`,
    icon: ICON.coin,
    onClick: async () => {
      const v = await modal(player, "Collection bonus", (f) =>
        f.textField("Bonus drop chance per tier (%)", String(C.bonusPerTier), { defaultValue: String(C.bonusPerTier) })
      );
      if (!v) return reopen();
      const n = num(v[0], 0, true);
      if (n === undefined) return reopen("§cEnter a number.");
      setCollections({ bonusPerTier: n });
      return reopen(`§aEach tier now gives +${n}% bonus drops.`);
    },
  });
  tiles.push({
    text: "§4§lRESET",
    sub: "§7Defaults",
    icon: ICON.cancel,
    onClick: () =>
      confirm(player, "RESET COLLECTIONS?", "§7Collection tiers and rewards go back to the defaults.\n§8(Players keep their collection counts.)", () => {
        resetSection("collections");
        return reopen("§aCollections reset to defaults.");
      }, () => reopen()),
  });
  return pagedMenu(player, {
    title: "COLLECTION SETTINGS",
    theme: "gold",
    body: (msg ? msg + "\n" : "") + "§7Tiers every crop & mob collection goes through. Each pays money once and adds bonus drops.",
    tiles,
    back,
  });
}

// ---- skills ------------------------------------------------------------------------
function skillsSettings(player, back, msg) {
  const reopen = (m) => skillsSettings(player, back, m);
  const SS = SKILL_SETTINGS;
  const tiles = Object.entries(SKILLS).map(([id, sk]) => ({
    text: `${sk.disabled ? "§c" : "§b"}§l${sk.name.toUpperCase()}`,
    sub: sk.disabled ? "§cOff" : `§a+${sk.perkPerLevel}%/lv §7x${sk.xpMultiplier ?? 1}`,
    icon: sk.icon,
    onClick: async () => {
      const v = await modal(player, `${sk.name} skill`, (f) =>
        f
          .toggle("Skill enabled", { defaultValue: !sk.disabled })
          .textField(`Perk per level (%) - ${sk.perk}`, String(sk.perkPerLevel), { defaultValue: String(sk.perkPerLevel) })
          .textField("XP multiplier (1 = normal, 2 = double XP)", String(sk.xpMultiplier ?? 1), { defaultValue: String(sk.xpMultiplier ?? 1) })
      );
      if (!v) return reopen();
      const perk = num(v[1], 0, true), mult = num(v[2], 0, true);
      if (perk === undefined || mult === undefined) return reopen("§cEnter numbers.");
      setSkill(id, { disabled: !v[0], perkPerLevel: perk, xpMultiplier: mult });
      success(player, `${sk.name} skill saved.`);
      return reopen(`§a${sk.name} saved.`);
    },
  }));
  tiles.push({
    text: "§e§lGENERAL",
    sub: `§7Max Lv ${SS.maxLevel}`,
    icon: ICON.admin,
    onClick: async () => {
      const v = await modal(player, "Skill settings", (f) =>
        f
          .textField("Max skill level", String(SS.maxLevel), { defaultValue: String(SS.maxLevel) })
          .textField("XP curve base (XP for level L = base x L^exponent)", String(SS.xpBase), { defaultValue: String(SS.xpBase) })
          .textField("XP curve exponent (higher = slower later levels)", String(SS.xpExponent), { defaultValue: String(SS.xpExponent) })
          .textField("Money reward per level (x the new level)", String(SS.moneyPerLevel), { defaultValue: String(SS.moneyPerLevel) })
          .toggle('Show "+XP" on the action bar', { defaultValue: SS.showActionBar })
      );
      if (!v) return reopen();
      const max = num(v[0], 1), base = num(v[1], 1), exp = num(v[2], 0, true), money = num(v[3], 0);
      if ([max, base, exp, money].some((x) => x === undefined)) return reopen("§cCheck the numbers.");
      setSkillSettings({ maxLevel: Math.min(100, max), xpBase: base, xpExponent: exp, moneyPerLevel: money, showActionBar: !!v[4] });
      return reopen("§aSkill settings saved.");
    },
  });
  tiles.push({
    text: "§4§lRESET",
    sub: "§7Defaults",
    icon: ICON.cancel,
    onClick: () =>
      confirm(player, "RESET SKILLS?", "§7Skill settings go back to the defaults.\n§8(Players keep their skill XP.)", () => {
        resetSection("skills");
        resetSection("skillSettings");
        return reopen("§aSkill settings reset.");
      }, () => reopen()),
  });
  tiles.push(backTile(back));
  return tileMenu(player, {
    title: "SKILL SETTINGS",
    theme: "blue",
    body:
      (msg ? msg + "\n" : "") +
      `§7Max level §f${SS.maxLevel}§7, level L needs §f${SS.xpBase} x L^${SS.xpExponent} §7XP, reward §a${fmt(SS.moneyPerLevel)} x level§7.\n§8Tap a skill to change its perk, XP rate or turn it off.`,
    tiles,
  });
}

// ---- minions ---------------------------------------------------------------------------
function minionSettings(player, back, msg) {
  const reopen = (m) => minionSettings(player, back, m);
  const M = MINION_SETTINGS;
  const tiles = [
    {
      text: "§e§lGENERAL",
      sub: `§a${fmt(M.price)}`,
      icon: ICON.admin,
      onClick: async () => {
        const v = await modal(player, "Minion settings", (f) =>
          f
            .textField("Shop price", String(M.price), { defaultValue: String(M.price) })
            .textField("Seconds per block (before Speed upgrades)", String(M.baseInterval), { defaultValue: String(M.baseInterval) })
            .textField("Storage (before Storage upgrades)", String(M.baseStorage), { defaultValue: String(M.baseStorage) })
            .textField("Max minions per player", String(M.maxPerPlayer), { defaultValue: String(M.maxPerPlayer) })
        );
        if (!v) return reopen();
        const price = num(v[0], 0), iv = num(v[1], 1, true), st = num(v[2], 1), mx = num(v[3], 0);
        if ([price, iv, st, mx].some((x) => x === undefined)) return reopen("§cCheck the numbers.");
        setMinionSettings({ price, baseInterval: iv, baseStorage: st, maxPerPlayer: mx });
        return reopen("§aMinion settings saved.");
      },
    },
    ...MINION_UPGRADES.map((u, i) => ({
      text: `§b§l${u.name.toUpperCase()}`,
      sub: `§7${u.money.length} lv, +${u.perLevel}`,
      icon: u.icon,
      onClick: async () => {
        const v = await modal(player, `Minion upgrade: ${u.name}`, (f) =>
          f
            .textField("Description", u.desc, { defaultValue: u.desc })
            .textField("Money cost for each level, comma separated", list(u.money), { defaultValue: list(u.money) })
            .textField(`Effect per level (${u.id === "storage" ? "items" : "%"})`, String(u.perLevel), { defaultValue: String(u.perLevel) })
        );
        if (!v) return reopen();
        const money = parseList(v[1]), per = num(v[2], 0, true);
        if (!money || per === undefined) return reopen("§cCosts must be a list of numbers, e.g. 1000, 5000, 20000.");
        const next = MINION_UPGRADES.map((x) => ({ ...x }));
        next[i] = { ...u, desc: String(v[0]).slice(0, 60), money, perLevel: per };
        setMinionUpgrades(next);
        return reopen(`§a${u.name} saved (${money.length} levels).`);
      },
    })),
    {
      text: "§d§lTIERS",
      sub: `§7${MINION_TIERS.length} tiers`,
      icon: "textures/items/diamond_pickaxe",
      onClick: () => minionTiersMenu(player, () => reopen()),
    },
    {
      text: "§4§lRESET",
      sub: "§7Defaults",
      icon: ICON.cancel,
      onClick: () =>
        confirm(player, "RESET MINIONS?", "§7Minion price, upgrades and tiers go back to the defaults.\n§8(Placed minions keep their levels.)", () => {
          resetSection("minionSettings");
          resetSection("minionUpgrades");
          resetSection("minionTiers");
          return reopen("§aMinion settings reset.");
        }, () => reopen()),
    },
    backTile(back),
  ];
  return tileMenu(player, {
    title: "MINION SETTINGS",
    theme: "orange",
    body:
      (msg ? msg + "\n" : "") +
      `§7Price §a${fmt(M.price)}§7, §f${M.baseInterval}s §7per block, storage §f${M.baseStorage}§7, max §f${M.maxPerPlayer} §7per player.`,
    tiles,
  });
}

function minionTiersMenu(player, back, msg) {
  const reopen = (m) => minionTiersMenu(player, back, m);
  const tiles = MINION_TIERS.map((t, i) => ({
    text: `§e§l${t.name.toUpperCase()}`,
    sub: i ? `§a${fmt(t.cost)}` : "§7Start tier",
    icon: ICON.top,
    onClick: async () => {
      const v = await modal(player, `Minion tier ${i + 1}: ${t.name}`, (f) => {
        f.textField("Name", t.name, { defaultValue: t.name });
        if (i > 0) f.textField("Money to upgrade into this tier", String(t.cost), { defaultValue: String(t.cost) });
        f.textField(`How many ${t.drop[0].replace("minecraft:", "").replace(/_/g, " ")} per block mined`, String(t.drop[1]), { defaultValue: String(t.drop[1]) });
      });
      if (!v) return reopen();
      const name = String(v[0]).trim().slice(0, 16);
      const cost = i > 0 ? num(v[1], 0) : 0;
      const amount = num(v[i > 0 ? 2 : 1], 1);
      if (!name || cost === undefined || amount === undefined) return reopen("§cCheck the numbers.");
      const next = MINION_TIERS.map((x) => ({ ...x, drop: [...x.drop] }));
      next[i] = { ...t, name, cost, drop: [t.drop[0], amount] };
      setMinionTiers(next);
      return reopen(`§a${name} saved.`);
    },
  }));
  return pagedMenu(player, {
    title: "MINION TIERS",
    theme: "orange",
    body: (msg ? msg + "\n" : "") + "§7The blocks a minion can mine (Better Blocks upgrade). Tap one to change its name, cost or drop amount.",
    tiles,
    back,
  });
}
