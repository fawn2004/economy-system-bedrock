import { EquipmentSlot, system, world } from "@minecraft/server";
import { addMoney } from "./economy.js";
import { ITEMS, RARITIES, STATS, STAT_ORDER, enchEff, isArmorKind, isToolKind, isWeaponKind, itemStats, readItem } from "./items.js";
import { skillHooks, skillLevel } from "./skills.js";
import { backTile, fail, tileMenu } from "./ui.js";

// ============================================================================
//  STATS & COMBAT
//  Every player has stats (Health, Defense, Strength, Crit Chance/Damage,
//  Speed, Intelligence, Magic Find, fortunes...). They add up from:
//    base + skill levels + armor + held weapon/tool + full-set bonuses
//    + anything other systems register in `statSources` (pets,
//      spirits, mayor, dungeon class...)
//  How they work in game:
//    Health   extra hearts (Health Boost)        Speed  Speed effect
//    Defense  takes def/(def+100) off damage     Mining Speed  Haste effect
//    Damage / Strength / Crit  extra damage on every hit you deal
//    Intelligence  max mana for item abilities (right click)
//    Fortunes  add to the matching skill's double-drop chance
//
//  Tough mobs (slayer bosses, dungeon mobs, sea creatures) have their own big
//  health pool ("virtual health") shown in their name.
// ============================================================================

export const BASE_STATS = { hp: 0, def: 0, str: 0, cc: 30, cd: 50, spd: 0, int: 100, mf: 0 };

/** Extra stat sources: (player) => { label, stats, passive? } | undefined */
export const statSources = [];
/** Things other systems want to know about: */
export const combatHooks = {
  playerHurt: [], // (player, damage, source) - after defense
  kill: [], // (player, deadEntity) - a player killed something
  damageBonus: [], // (player, target) -> extra % damage (e.g. pet vs bosses, dungeon class)
};

const SETS = {
  knight: { name: "Knight", stats: { def: 20 } },
  crypt: { name: "Crypt", stats: { str: 30, hp: 4 } },
  phantom: { name: "Phantom", stats: { cd: 30, spd: 5 } },
  sovereign: { name: "Sovereign", stats: { str: 50, def: 50, hp: 10 } },
};

const SKILL_STATS = [
  ["farming", "hp", 0.5],
  ["mining", "def", 1],
  ["combat", "cc", 0.5],
  ["foraging", "str", 1],
  ["fishing", "hp", 0.5],
  ["excavating", "ms", 1],
];

// ---- gathering ------------------------------------------------------------------
function equipment(player) {
  const out = [];
  try {
    const eq = player.getComponent("minecraft:equippable");
    for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet]) {
      const it = eq?.getEquipment(slot);
      if (it) out.push({ slot, item: it });
    }
  } catch {}
  return out;
}

export function heldItem(player) {
  try {
    return player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
  } catch {
    return undefined;
  }
}

const buffs = new Map(); // player id -> [{ stats, until }]
export function addBuff(player, stats, seconds) {
  const list = (buffs.get(player.id) ?? []).filter((b) => b.until > Date.now());
  list.push({ stats, until: Date.now() + seconds * 1000 });
  buffs.set(player.id, list);
  invalidate(player);
}

/** -> { total: {stat: n}, parts: [{ label, stats }], passive: {}, held } */
export function computeStats(player) {
  const parts = [{ label: "Starting stats (everyone has these)", stats: { ...BASE_STATS } }];
  const sk = {};
  for (const [id, st, per] of SKILL_STATS) {
    try {
      const v = Math.floor(skillLevel(player, id) * per);
      if (v) sk[st] = (sk[st] ?? 0) + v;
    } catch {}
  }
  parts.push({ label: "Skills", stats: sk });
  const passive = {};
  const addPassive = (p) => {
    for (const [k, v] of Object.entries(p ?? {})) passive[k] = (passive[k] ?? 0) + v;
  };
  const sets = {};
  for (const { item } of equipment(player)) {
    const info = readItem(item);
    if (!info || !isArmorKind(info.kind)) continue;
    parts.push({ label: item.nameTag?.replace(/§./g, "") || info.kind, stats: itemStats(info) });
    addPassive(info.def?.passive);
    for (const [c, l] of Object.entries(info.ench)) passive["arm_" + c] = (passive["arm_" + c] ?? 0) + enchEff(l);
    if (info.def?.set) sets[info.def.set] = (sets[info.def.set] ?? 0) + 1;
  }
  for (const [set, n] of Object.entries(sets)) if (n >= 4 && SETS[set]) parts.push({ label: `${SETS[set].name} set bonus`, stats: SETS[set].stats });
  const held = heldItem(player);
  const heldInfo = readItem(held);
  if (heldInfo && (isWeaponKind(heldInfo.kind) || isToolKind(heldInfo.kind))) {
    parts.push({ label: held.nameTag?.replace(/§./g, "") || "Held item", stats: itemStats(heldInfo) });
    addPassive(heldInfo.def?.passive);
    for (const [c, l] of Object.entries(heldInfo.ench)) passive["en_" + c] = enchEff(l);
  }
  for (const b of buffs.get(player.id) ?? []) if (b.until > Date.now()) parts.push({ label: "Ability buff", stats: b.stats });
  for (const src of statSources) {
    try {
      const r = src(player);
      if (r && Object.keys(r.stats ?? {}).length) parts.push({ label: r.label, stats: r.stats });
      if (r?.passive) addPassive(r.passive);
    } catch {}
  }
  const total = {};
  for (const p of parts) for (const [k, v] of Object.entries(p.stats)) total[k] = (total[k] ?? 0) + v;
  return { total, parts, passive, heldInfo };
}

const cache = new Map(); // id -> { at, stats }
export function getStats(player) {
  const c = cache.get(player.id);
  if (c && system.currentTick - c.at < 10) return c.stats;
  const stats = computeStats(player);
  cache.set(player.id, { at: system.currentTick, stats });
  return stats;
}
export const invalidate = (player) => cache.delete(player.id);
export const stat = (player, id) => getStats(player).total[id] ?? 0;

// ---- effects (health, speed, haste) ---------------------------------------------------
const applied = new Map(); // id -> "hb:sp:hs"

function applyEffects(player) {
  const t = getStats(player).total;
  const hp = Math.floor(t.hp ?? 0);
  const hb = hp >= 4 ? Math.min(60, Math.floor(hp / 4) - 1) : -1;
  const sp = (t.spd ?? 0) >= 20 ? Math.min(6, Math.floor(t.spd / 20) - 1) : -1;
  const hs = (t.ms ?? 0) >= 25 ? Math.min(4, Math.floor(t.ms / 25) - 1) : -1;
  const nv = getStats(player).passive.arm_nv ? 1 : 0;
  const key = `${hb}:${sp}:${hs}:${nv}`;
  const refresh = system.currentTick % 200 < 20;
  if (applied.get(player.id) === key && !refresh) return;
  applied.set(player.id, key);
  const set = (name, amp) => {
    try {
      const cur = player.getEffect(name);
      if (amp < 0) {
        if (cur && cur.duration < 1000) player.removeEffect(name);
        return;
      }
      if (cur && cur.amplifier > amp && cur.duration > 1000) return; // a stronger potion is active
      player.addEffect(name, 600, { amplifier: amp, showParticles: false });
    } catch {}
  };
  set("health_boost", hb);
  set("speed", sp);
  set("haste", hs);
  if (nv) set("night_vision", 0); // only ever adds it (Full Bright in Player Settings uses it too); it runs out when the helmet comes off
}

// ---- mana & abilities ------------------------------------------------------------------
const mana = new Map(); // id -> current mana
export const maxMana = (player) => Math.max(0, Math.floor(stat(player, "int")));
export const getMana = (player) => Math.min(mana.get(player.id) ?? maxMana(player), maxMana(player));
const cooldowns = new Map(); // `${id}:${ability}` -> time ms

function regenMana(player) {
  const max = maxMana(player);
  mana.set(player.id, Math.min(max, getMana(player) + Math.max(1, max * 0.02)));
}

function viewDir(player) {
  return player.getViewDirection();
}

function hurtMagic(player, target, amount) {
  try {
    target.applyDamage(Math.max(1, Math.round(amount)), { cause: "magic", damagingEntity: player });
  } catch {}
}

const ABILITIES = {
  blink: (player) => blink(player, 8),
  blink12: (player) => {
    blink(player, 12);
    addBuff(player, { str: 50 }, 3);
  },
  ember: (player, def) => {
    const dir = viewDir(player);
    const head = player.getHeadLocation();
    for (let i = 1; i <= 16; i += 1.5) {
      try {
        player.dimension.spawnParticle("minecraft:basic_flame_particle", { x: head.x + dir.x * i, y: head.y + dir.y * i, z: head.z + dir.z * i });
      } catch {}
    }
    const hit = player.getEntitiesFromViewDirection({ maxDistance: 16 }).find((h) => !["minecraft:player", "minecraft:item", "eco:pet", "eco:npc"].includes(h.entity.typeId));
    if (hit) {
      const int = stat(player, "int");
      hurtMagic(player, hit.entity, (8 + (ITEMS[def.id]?.stats?.dmg ?? 0)) * (1 + int / 100));
      try {
        hit.entity.setOnFire(3, true);
      } catch {}
    }
    player.playSound("mob.blaze.shoot");
  },
  heal: (player) => {
    const int = stat(player, "int");
    for (const p of player.dimension.getPlayers({ location: player.location, maxDistance: 8 })) {
      const h = p.getComponent("minecraft:health");
      if (!h) continue;
      h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + h.effectiveMax * 0.2 + int / 20));
      try {
        p.dimension.spawnParticle("minecraft:heart_particle", { ...p.location, y: p.location.y + 2 });
      } catch {}
      if (p.id !== player.id) p.sendMessage(`§a${player.name} healed you!`);
    }
    player.playSound("random.orb", { pitch: 1.5 });
  },
  quake: (player) => {
    const t = getStats(player).total;
    const dmg = (12 + (t.dmg ?? 0)) * (1 + (t.str ?? 0) / 100) * (1 + (t.int ?? 0) / 300);
    for (const e of player.dimension.getEntities({ location: player.location, maxDistance: 6, excludeTypes: ["minecraft:player", "minecraft:item", "eco:npc", "eco:minion", "eco:minion_block", "eco:pet"] })) {
      hurtMagic(player, e, dmg);
      try {
        e.applyKnockback({ x: 0, z: 0 }, 0.8);
      } catch {}
    }
    try {
      player.dimension.spawnParticle("minecraft:huge_explosion_emitter", player.location);
    } catch {}
    player.playSound("random.explode");
  },
  wrath: (player) => {
    addBuff(player, { str: 100 }, 6);
    player.playSound("mob.enderdragon.growl", { volume: 0.5 });
    player.sendMessage("§6§lROYAL WRATH! §r§c+100 Strength §7for 6s");
  },
};

function blink(player, dist) {
  const dir = viewDir(player);
  let d = dist;
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: dist });
    if (hit) d = Math.max(0, Math.sqrt((hit.block.x + 0.5 - player.location.x) ** 2 + (hit.block.z + 0.5 - player.location.z) ** 2) - 1.2);
  } catch {}
  const l = player.location;
  try {
    player.teleport({ x: l.x + dir.x * d, y: l.y + Math.max(0, dir.y * d), z: l.z + dir.z * d }, { keepVelocity: false, rotation: player.getRotation() });
  } catch {}
  player.playSound("mob.endermen.portal");
  try {
    player.addEffect("speed", 60, { amplifier: 1, showParticles: false });
  } catch {}
}

function useAbility(player, stack) {
  const info = readItem(stack);
  const def = info?.def;
  const ab = def?.ability;
  if (!ab || !ABILITIES[ab.id]) return false;
  const key = `${player.id}:${ab.id}`;
  const ready = cooldowns.get(key) ?? 0;
  if (Date.now() < ready) {
    fail(player, `${ab.name} is on cooldown (${Math.ceil((ready - Date.now()) / 1000)}s).`);
    return true;
  }
  const cur = getMana(player);
  if (cur < ab.mana) {
    try {
      player.onScreenDisplay.setActionBar(`§cNot enough mana! §b✎ ${Math.floor(cur)}/${maxMana(player)}`);
    } catch {}
    return true;
  }
  mana.set(player.id, cur - ab.mana);
  cooldowns.set(key, Date.now() + (ab.cooldown ?? 0) * 1000);
  ABILITIES[ab.id](player, def);
  try {
    player.onScreenDisplay.setActionBar(`§6${ab.name}! §b-${ab.mana} Mana §8(✎ ${Math.floor(getMana(player))}/${maxMana(player)})`);
  } catch {}
  return true;
}

// ---- tough mobs (virtual health) ---------------------------------------------------------
const TOUGH_RES = 0.2; // tough mobs get Resistance IV, so vanilla hits only do 20%: we scale them back up

export const isTough = (e) => {
  try {
    return typeof e.getDynamicProperty("eco:vmax") === "number";
  } catch {
    return false;
  }
};
const vhp = (e) => Number(e.getDynamicProperty("eco:vhp") ?? 0);
const shortNum = (n) => (n >= 1e6 ? (Math.round(n / 1e5) / 10) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : String(Math.ceil(n)));

export function toughName(e) {
  try {
    const name = String(e.getDynamicProperty("eco:vname") ?? "");
    const max = Number(e.getDynamicProperty("eco:vmax"));
    const cur = vhp(e);
    const col = cur > max * 0.5 ? "§a" : cur > max * 0.25 ? "§e" : "§c";
    e.nameTag = `${name} ${col}${shortNum(cur)}§7/§a${shortNum(max)}§c❤`;
  } catch {}
}

/** Makes a mob tough: big health pool, a name, and extra damage per hit (before the player's Defense). */
export function makeTough(e, maxHp, name, atk = 0) {
  e.setDynamicProperty("eco:vmax", maxHp);
  e.setDynamicProperty("eco:vhp", maxHp);
  e.setDynamicProperty("eco:vname", name);
  if (atk) e.setDynamicProperty("eco:atk", atk);
  try {
    e.addEffect("resistance", 20000000, { amplifier: 3, showParticles: false });
    e.addEffect("fire_resistance", 20000000, { amplifier: 0, showParticles: false });
  } catch {}
  toughName(e);
}

/** Damages a tough mob's pool. Returns true if it died. */
export function damageTough(e, amount, killer) {
  const left = vhp(e) - amount;
  e.setDynamicProperty("eco:vhp", Math.max(0, left));
  if (left > 0) {
    try {
      e.getComponent("minecraft:health")?.resetToMaxValue();
    } catch {}
    toughName(e);
    return false;
  }
  e.setDynamicProperty("eco:dying", true);
  try {
    e.removeEffect("resistance");
  } catch {}
  try {
    if (killer?.isValid) e.applyDamage(99999, { cause: "entityAttack", damagingEntity: killer });
    else e.kill();
  } catch {
    try {
      e.kill();
    } catch {}
  }
  return true;
}

// ---- combat ------------------------------------------------------------------------------
const hitCount = new Map();

function healthRatio(e) {
  if (isTough(e)) return vhp(e) / Number(e.getDynamicProperty("eco:vmax"));
  const h = e.getComponent("minecraft:health");
  return h ? h.currentValue / h.effectiveMax : 1;
}

function showDamage(player, n, crit) {
  try {
    player.onScreenDisplay.setActionBar(crit ? `§f✧ §e${shortNum(n)} §f✧ §6CRIT` : `§7${shortNum(n)} damage`);
  } catch {}
}

function onHurt({ hurtEntity: target, damage, damageSource }) {
  if (damage >= 90000) return; // our own finishing blow
  try {
    if (target.getDynamicProperty("eco:dying")) return;
  } catch {
    return;
  }
  let attacker = damageSource?.damagingEntity;
  if (attacker?.typeId !== "minecraft:player") attacker = undefined;
  const cause = damageSource?.cause;

  // ---- player getting hit: Defense + tough mob extra damage
  if (target.typeId === "minecraft:player") {
    const h = target.getComponent("minecraft:health");
    if (!h || h.currentValue <= 0) return;
    const pas = getStats(target).passive;
    let def = Math.max(0, stat(target, "def"));
    if (pas.arm_lt && h.currentValue < h.effectiveMax * 0.3) def *= 1 + 0.15 * Math.min(10, pas.arm_lt); // Last Stand (max +150%)
    const red = def / (def + 100);
    let extra = 0;
    const src = damageSource?.damagingEntity;
    try {
      if (src && src.typeId !== "minecraft:player") extra = Number(src.getDynamicProperty("eco:atk") ?? 0);
    } catch {}
    const net = -damage * red + extra * (1 - red);
    if (net !== 0 && cause !== "override" && cause !== "void" && cause !== "selfDestruct") {
      h.setCurrentValue(Math.max(1, Math.min(h.effectiveMax, h.currentValue - net)));
    }
    // Retaliate: hit the attacker back
    if (pas.arm_rf && src && src.typeId !== "minecraft:player" && cause !== "thorns") {
      try {
        src.applyDamage(Math.max(1, damage * 0.04 * Math.min(15, pas.arm_rf)), { cause: "thorns", damagingEntity: target });
      } catch {}
    }
    for (const f of combatHooks.playerHurt) {
      try {
        f(target, damage * (1 - red) + extra * (1 - red), damageSource);
      } catch {}
    }
    return;
  }

  const tough = isTough(target);
  const raw = tough ? damage / TOUGH_RES : damage;
  if (!attacker || cause === "magic" || cause === "thorns") {
    if (tough) damageTough(target, raw, attacker);
    return;
  }

  // ---- a player hit a mob: Damage, Strength, Crit, enchantments
  const st = getStats(attacker);
  const t = st.total;
  const p = st.passive;
  let mult = 1 + Math.max(0, t.str ?? 0) / 100;
  let pct = (p.en_sh ?? 0) * 5;
  if (p.en_ex && healthRatio(target) < 0.5) pct += p.en_ex * 4;
  for (const f of combatHooks.damageBonus) {
    try {
      pct += Number(f(attacker, target)) || 0;
    } catch {}
  }
  const n = (hitCount.get(attacker.id) ?? 0) + 1;
  hitCount.set(attacker.id, n);
  let storm = false;
  if (p.en_st && n % 4 === 0) {
    pct += 20 * p.en_st;
    storm = true;
  }
  let total = (raw + (t.dmg ?? 0)) * mult * (1 + pct / 100);
  const crit = Math.random() * 100 < (t.cc ?? 0);
  if (crit) total *= 1 + Math.max(0, t.cd ?? 0) / 100;
  showDamage(attacker, total, crit);

  if (storm) {
    try {
      target.dimension.spawnParticle("minecraft:knockback_roar_particle", target.location);
      attacker.playSound("ambient.weather.thunder", { volume: 0.4, pitch: 1.6 });
    } catch {}
  }
  if (p.en_vn || p.venom) {
    try {
      target.addEffect("poison", 40 + Math.round((p.en_vn ?? 1) * 10), { amplifier: Math.max(0, Math.min(4, Math.floor((p.en_vn ?? 1) - 1))) });
    } catch {}
  }
  const steal = (p.en_ls ?? 0) + (p.lifesteal ?? 0);
  if (steal > 0) {
    const h = attacker.getComponent("minecraft:health");
    if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + (total * steal) / 100));
  }

  if (tough) {
    damageTough(target, total, attacker);
    return;
  }
  const extra = total - damage;
  if (extra <= 0) return;
  const h = target.getComponent("minecraft:health");
  if (!h || h.currentValue <= 0) return;
  if (h.currentValue - extra > 0) h.setCurrentValue(h.currentValue - extra);
  else {
    try {
      target.applyDamage(99999, { cause: "entityAttack", damagingEntity: attacker });
    } catch {}
  }
}

// ---- stats menu ---------------------------------------------------------------------------
export function statText(id, v) {
  const s = STATS[id];
  return `${s.color}${s.sym} ${s.name} §f${Math.round(v * 10) / 10}${s.pct ? "%" : ""}`;
}

// What each stat does, in plain words (v = your total)
const STAT_HELP = {
  hp: { icon: "textures/ui/heart", say: (v) => `§fYou have §c${Math.round((20 + v) / 2 * 10) / 10} hearts§f (normal is 10).\n§7Every 2 Health = 1 extra heart.` },
  def: { icon: "textures/items/iron_chestplate", say: (v) => `§fYou take §a${Math.round((v / (v + 100)) * 100)}% less damage§f from every hit.\n§7100 Defense = half damage.` },
  str: { icon: "textures/items/blaze_powder", say: (v) => `§fEvery hit you land does §c+${Math.round(v)}% damage§f.` },
  cc: { icon: "textures/items/flint", say: (v) => `§f§9${Math.round(v)}%§f of your hits are §9critical hits§f.` },
  cd: { icon: "textures/items/diamond_sword", say: (v) => `§fCritical hits do §9+${Math.round(v)}% damage§f on top.` },
  dmg: { icon: "textures/items/iron_sword", say: (v) => `§fYour weapon adds §c+${Math.round(v)} damage§f to every hit.` },
  spd: { icon: "textures/items/sugar", say: (v) => `§fYou move faster: §f${v >= 20 ? `Speed ${Math.min(7, Math.floor(v / 20))} effect` : "no Speed effect yet"}§f.\n§7Every 20 Speed = 1 level of Speed.` },
  int: { icon: "textures/items/book_enchanted", say: (v) => `§fYour max §bmana§f is §b${Math.round(v)}§f.\n§7Mana is used by right-click item abilities and refills 2% a second.` },
  mf: { icon: "textures/items/gold_nugget", say: (v) => `§fRare drops from bosses, dungeon chests and sea creatures are §b${Math.round(v)}% more likely§f.` },
  ms: { icon: "textures/items/iron_pickaxe", say: (v) => `§fYou mine faster: §f${v >= 25 ? `Haste ${Math.min(5, Math.floor(v / 25))} effect` : "no Haste effect yet"}§f.\n§7Every 25 Mining Speed = 1 level of Haste.` },
  mfo: { icon: "textures/items/diamond", say: (v) => `§f§6+${Math.round(v)}%§f chance of extra drops when §6mining§f.` },
  ffo: { icon: "textures/items/wheat", say: (v) => `§f§6+${Math.round(v)}%§f chance of extra crops when §6farming§f.` },
  wfo: { icon: "textures/blocks/log_oak", say: (v) => `§f§6+${Math.round(v)}%§f chance of extra logs when §6chopping trees§f.` },
  scc: { icon: "textures/items/fishing_rod_uncast", say: (v) => `§fEach catch has a §3${Math.round((2 + v) * 10) / 10}%§f chance to pull up a §3sea creature§f.` },
};
const ALWAYS_SHOW = ["hp", "def", "str", "cc", "cd", "spd", "int", "mf"];

export async function statsMenu(player, back) {
  invalidate(player);
  const again = () => statsMenu(player, back);
  const st = getStats(player);
  const t = st.total;
  const show = STAT_ORDER.filter((k) => STAT_HELP[k] && (ALWAYS_SHOW.includes(k) || Math.round(t[k] ?? 0) !== 0));
  const tiles = show.map((k, i) => {
    const s = STATS[k];
    const v = t[k] ?? 0;
    const from = st.parts
      .filter((p) => p.stats[k])
      .map((p) => `§7- ${p.label}: ${p.stats[k] > 0 ? "§a+" : "§c"}${Math.round(p.stats[k] * 10) / 10}`);
    return {
      text: `${s.color}${s.sym} ${s.name}: §f${Math.round(v * 10) / 10}${s.pct ? "%" : ""}`,
      sub: `${STAT_HELP[k].say(v)}${from.length ? `\n\n§7Comes from:\n${from.join("\n")}` : ""}`,
      icon: STAT_HELP[k].icon,
      newRow: i === ALWAYS_SHOW.length && i > 0, // fortunes etc. on their own row
      noClick: true,
      onClick: again,
    };
  });
  tiles.push(backTile(back));
  const h = player.getComponent("minecraft:health");
  await tileMenu(player, {
    title: "Your Stats",
    theme: "red",
    body: [
      `§f§l${player.name}§r`,
      `§c❤ ${Math.ceil((h?.currentValue ?? 20) / 2)}§7/§c${Math.ceil((h?.effectiveMax ?? 20) / 2)} hearts`,
      `§a❈ -${Math.round(((t.def ?? 0) / ((t.def ?? 0) + 100)) * 100)}% damage taken`,
      `§b✎ ${Math.floor(getMana(player))}§7/§b${maxMana(player)} mana`,
      "",
      "§7Hover over a stat to see what it does and where it comes from.",
      "§8Everyone starts with 30% Crit Chance, 50% Crit Damage and 100 Intelligence. Armor, weapons, skills, pets, slayer levels, kits, spirits and the mayor add more.",
    ].join("\n"),
    tiles,
  });
}

// ---- register -----------------------------------------------------------------------------
export function registerStats() {
  // fortunes add to the matching skill's double-drop chance
  skillHooks.perkBonus.push((player, id) => {
    const k = { farming: "ffo", mining: "mfo", foraging: "wfo" }[id];
    return k ? stat(player, k) : 0;
  });

  world.afterEvents.entityHurt.subscribe((ev) => {
    try {
      onHurt(ev);
    } catch (e) {
      console.warn("[eco] combat: " + e);
    }
  });

  world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
    const killer = damageSource?.damagingEntity;
    if (killer?.typeId !== "minecraft:player") return;
    const p = getStats(killer).passive;
    if (p.en_sv) addMoney(killer, p.en_sv * 3);
    for (const f of combatHooks.kill) {
      try {
        f(killer, deadEntity);
      } catch {}
    }
  });

  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (source?.typeId !== "minecraft:player" || source.isSneaking) return;
    try {
      useAbility(source, itemStack);
    } catch (e) {
      console.warn("[eco] ability: " + e);
    }
  });

  world.afterEvents.worldLoad.subscribe(() => {
    system.runInterval(() => {
      for (const p of world.getAllPlayers()) {
        try {
          invalidate(p);
          applyEffects(p);
          regenMana(p);
          const rg = getStats(p).passive.arm_rg;
          if (rg && system.currentTick % 100 < 20) {
            const h = p.getComponent("minecraft:health");
            if (h && h.currentValue > 0 && h.currentValue < h.effectiveMax) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + Math.min(5, 0.25 * rg)));
          }
          const info = readItem(heldItem(p));
          if (info?.def?.ability) p.onScreenDisplay.setActionBar(`§b✎ ${Math.floor(getMana(p))}/${maxMana(p)} Mana`);
        } catch {}
      }
    }, 20);
  });
}

export { equipment };
