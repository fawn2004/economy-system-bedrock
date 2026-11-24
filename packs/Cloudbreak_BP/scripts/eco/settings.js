import { world } from "@minecraft/server";
import { CHUNK_HOPPER, COLLECTION_TIERS, CONFIG, KITS, MINION_SETTINGS, MINION_TYPES, MINION_UPGRADES, SKILLS, SKILL_SETTINGS, SKILL_TOOLS, SPAWNERS, SPAWNER_SETTINGS, TOOL_LEVELS, TOOL_UPGRADES } from "./config.js";

// ============================================================================
//  IN-GAME SETTINGS
//  Values in config.js are the defaults. Admins change them in-game
//  (Admin > Settings); the changes are saved in the world and applied on top
//  of config.js every time the world loads, so they survive add-on updates.
//
//  The config objects are edited in place, so every other script sees the
//  new values straight away.
// ============================================================================

const SETTINGS_KEY = "eco:settings";
const KITS_KEY = "eco:kits";

const clone = (o) => JSON.parse(JSON.stringify(o));
const DEFAULTS = {
  config: {
    startingBalance: CONFIG.startingBalance,
    currency: CONFIG.currency,
    pageSize: CONFIG.pageSize,
    giveOnJoin: CONFIG.compass.giveOnJoin,
    centerNav: CONFIG.centerNav,
    itemStacking: clone(CONFIG.itemStacking),
    sidebar: clone(CONFIG.sidebar),
  },
  spawner: clone(SPAWNER_SETTINGS),
  mobs: Object.fromEntries(SPAWNERS.map((s) => [s.mob, { price: s.price, disabled: false }])),
  kits: clone(KITS),
  tools: clone(SKILL_TOOLS),
  upgrades: clone(TOOL_UPGRADES),
  toolLevels: clone(TOOL_LEVELS),
  collections: clone(COLLECTION_TIERS),
  skills: clone(SKILLS),
  skillSettings: clone(SKILL_SETTINGS),
  minionSettings: clone(MINION_SETTINGS),
  minionUpgrades: clone(MINION_UPGRADES),
  minionTypes: clone(MINION_TYPES),
  chunkHopper: clone(CHUNK_HOPPER),
};

// Spawner settings that are simple numbers / switches (shown in the settings form)
export const SPAWNER_NUMBERS = [
  ["maxStack", "Spawners per block (stack limit)", 1],
  ["mobsPerSpawn", "Mobs per spawner, each spawn", 1],
  ["activationRange", "Player must be within (blocks)", 1],
  ["maxMobStack", "Mob stack limit (0 = no limit)", 0],
  ["mergeRadius", "Mob merge radius (blocks)", 1],
  ["maxLooseMobs", "Max loose mobs (if mob stacking is off)", 1],
];
export const SPAWNER_SWITCHES = [
  ["stackMobs", "Merge mobs into one stack"],
  ["freezeMobs", "Mobs stand still (no walking / burning)"],
  ["costTimesStack", "Upgrade cost x stack size (anti-exploit)"],
];

function readSaved() {
  try {
    const raw = world.getDynamicProperty(SETTINGS_KEY);
    return typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

let saved = {};

function applyConfig() {
  const c = { ...DEFAULTS.config, ...(saved.config ?? {}) };
  CONFIG.startingBalance = c.startingBalance;
  CONFIG.currency = c.currency;
  CONFIG.pageSize = c.pageSize;
  CONFIG.compass.giveOnJoin = c.giveOnJoin;
  CONFIG.centerNav = c.centerNav !== false;
  CONFIG.itemStacking = { ...DEFAULTS.config.itemStacking, ...(c.itemStacking ?? {}) };
  CONFIG.sidebar = { ...DEFAULTS.config.sidebar, ...(c.sidebar ?? {}) };
}

function applySpawner() {
  const s = { ...clone(DEFAULTS.spawner), ...(saved.spawner ?? {}) };
  for (const k of Object.keys(SPAWNER_SETTINGS)) delete SPAWNER_SETTINGS[k];
  Object.assign(SPAWNER_SETTINGS, s);
}

function applyMobs() {
  for (const sp of SPAWNERS) {
    const m = { ...DEFAULTS.mobs[sp.mob], ...(saved.mobs?.[sp.mob] ?? {}) };
    sp.price = m.price;
    sp.disabled = !!m.disabled;
  }
}

function applyKits() {
  let kits = DEFAULTS.kits;
  try {
    const raw = world.getDynamicProperty(KITS_KEY);
    if (typeof raw === "string") kits = JSON.parse(raw);
  } catch {}
  KITS.length = 0;
  KITS.push(...clone(kits));
}

function replaceObject(target, values) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, clone(values));
}

function applyTools() {
  for (const kind of Object.keys(SKILL_TOOLS)) {
    replaceObject(SKILL_TOOLS[kind], { ...DEFAULTS.tools[kind], ...(saved.tools?.[kind] ?? {}) });
  }
  for (const kind of Object.keys(DEFAULTS.upgrades)) {
    TOOL_UPGRADES[kind].length = 0;
    TOOL_UPGRADES[kind].push(...clone(saved.upgrades?.[kind] ?? DEFAULTS.upgrades[kind]));
  }
  replaceObject(TOOL_LEVELS, { ...DEFAULTS.toolLevels, ...(saved.toolLevels ?? {}) });
  replaceObject(COLLECTION_TIERS, { ...DEFAULTS.collections, ...(saved.collections ?? {}) });
}

/** Call once when the world loads. */
export function applySavedSettings() {
  saved = readSaved();
  applyConfig();
  applySpawner();
  applyMobs();
  applyKits();
  applyTools();
  applySkills();
  applyMinions();
  replaceObject(CHUNK_HOPPER, { ...DEFAULTS.chunkHopper, ...(saved.chunkHopper ?? {}) });
}

export function setChunkHopper(values) {
  saved.chunkHopper = { ...(saved.chunkHopper ?? {}), ...clone(values) };
  store();
  replaceObject(CHUNK_HOPPER, { ...DEFAULTS.chunkHopper, ...saved.chunkHopper });
}

function applyMinions() {
  replaceObject(MINION_SETTINGS, { ...DEFAULTS.minionSettings, ...(saved.minionSettings ?? {}) });
  MINION_UPGRADES.length = 0;
  MINION_UPGRADES.push(...clone(saved.minionUpgrades ?? DEFAULTS.minionUpgrades));
  for (const t of MINION_TYPES) {
    const def = DEFAULTS.minionTypes.find((x) => x.id === t.id);
    const sv = saved.minionTypes?.[t.id] ?? {};
    t.price = sv.price ?? def.price;
    t.upgradeMultiplier = sv.upgradeMultiplier ?? def.upgradeMultiplier;
    // older versions saved the Mining Minion's tiers as "minionTiers"
    const tiers = sv.tiers ?? (t.id === "cloud" ? saved.minionTiers : undefined) ?? def.tiers;
    t.tiers.length = 0;
    t.tiers.push(...clone(tiers).map((x, i) => ({ ...x, display: def.tiers[i]?.display ?? x.display })));
  }
}

export function setMinionType(id, values) {
  saved.minionTypes = saved.minionTypes ?? {};
  saved.minionTypes[id] = { ...(saved.minionTypes[id] ?? {}), ...clone(values) };
  store();
  applyMinions();
}

export function setMinionSettings(values) {
  saved.minionSettings = { ...(saved.minionSettings ?? {}), ...values };
  store();
  applyMinions();
}

export function setMinionUpgrades(list) {
  saved.minionUpgrades = clone(list);
  store();
  applyMinions();
}

export function setMinionTiers(list) {
  setMinionType("cloud", { tiers: list });
}

function applySkills() {
  replaceObject(SKILL_SETTINGS, { ...DEFAULTS.skillSettings, ...(saved.skillSettings ?? {}) });
  for (const id of Object.keys(DEFAULTS.skills)) {
    replaceObject(SKILLS[id], { ...DEFAULTS.skills[id], ...(saved.skills?.[id] ?? {}) });
  }
}

export function setSkill(id, values) {
  saved.skills = saved.skills ?? {};
  saved.skills[id] = { ...(saved.skills[id] ?? {}), ...values };
  store();
  applySkills();
}

export function setSkillSettings(values) {
  saved.skillSettings = { ...(saved.skillSettings ?? {}), ...values };
  store();
  applySkills();
}

export function setTool(kind, values) {
  saved.tools = saved.tools ?? {};
  saved.tools[kind] = { ...(saved.tools[kind] ?? {}), ...values };
  store();
  applyTools();
}

export function setUpgrades(kind, list) {
  saved.upgrades = saved.upgrades ?? {};
  saved.upgrades[kind] = clone(list);
  store();
  applyTools();
}

export function setToolLevels(values) {
  saved.toolLevels = { ...clone(TOOL_LEVELS), ...values };
  store();
  applyTools();
}

export function setCollections(values) {
  saved.collections = { ...clone(COLLECTION_TIERS), ...values };
  store();
  applyTools();
}

function store() {
  world.setDynamicProperty(SETTINGS_KEY, JSON.stringify(saved));
}

export function setConfig(values) {
  saved.config = { ...(saved.config ?? {}), ...values };
  store();
  applyConfig();
}

export function setSpawner(values) {
  saved.spawner = { ...(saved.spawner ?? {}), ...values };
  store();
  applySpawner();
}

export function setLevels(levels) {
  setSpawner({ levels: clone(levels) });
}

export function setMob(mob, values) {
  saved.mobs = saved.mobs ?? {};
  saved.mobs[mob] = { ...(saved.mobs[mob] ?? {}), ...values };
  store();
  applyMobs();
}

export function saveKits() {
  world.setDynamicProperty(KITS_KEY, JSON.stringify(KITS));
}

export function defaultsFor(section) {
  return clone(DEFAULTS[section]);
}

export function resetSection(section) {
  if (section === "kits") {
    world.setDynamicProperty(KITS_KEY, undefined);
    applyKits();
    return;
  }
  delete saved[section];
  store();
  applySavedSettings();
}

export function resetAllSettings() {
  saved = {};
  world.setDynamicProperty(SETTINGS_KEY, undefined);
  world.setDynamicProperty(KITS_KEY, undefined);
  applySavedSettings();
}
