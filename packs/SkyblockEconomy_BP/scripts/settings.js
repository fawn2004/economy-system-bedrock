import { world } from "@minecraft/server";
import { CONFIG, KITS, SPAWNERS, SPAWNER_SETTINGS } from "./config.js";

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
  config: { startingBalance: CONFIG.startingBalance, currency: CONFIG.currency, pageSize: CONFIG.pageSize, giveOnJoin: CONFIG.compass.giveOnJoin },
  spawner: clone(SPAWNER_SETTINGS),
  mobs: Object.fromEntries(SPAWNERS.map((s) => [s.mob, { price: s.price, disabled: false }])),
  kits: clone(KITS),
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

/** Call once when the world loads. */
export function applySavedSettings() {
  saved = readSaved();
  applyConfig();
  applySpawner();
  applyMobs();
  applyKits();
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
