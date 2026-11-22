import { BlockPermutation, EnchantmentTypes, ItemStack, system, world } from "@minecraft/server";
import { COLLECTION_TIERS, CROPS, MOB_DROPS, SKILL_TOOLS, SPAWNERS, TOOL_KIT_BONUS, TOOL_LEVELS, TOOL_UPGRADES } from "./config.js";
import { readItem } from "./items.js";
import { combatHooks, statSources } from "./stats.js";
import { addMoney, fmt, fmtMoney, getBalance, takeMoney } from "./economy.js";
import { addHeadPoints, getHeadPoints, mobName } from "./spawners.js";
import { addSkillXp, skillPerk } from "./skills.js";
import { SKILLS } from "./config.js";
import { ICON, backTile, fail, success, tileMenu, withNav } from "./ui.js";

// ============================================================================
//  SKILL TOOLS & COLLECTIONS
//  - Farming Hoe / Slayer Sword: gain XP when used, level up automatically.
//    Levels above TOOL_LEVELS.freeLevels also need a total collection.
//    Level + XP live in a hidden lore line:  §8eco:tool:<kind>:<level>:<xp>
//  - Collections: per player, per crop / mob. Tiers pay money once and give a
//    permanent bonus drop chance for that crop / mob.
// ============================================================================

const TAG = "§8eco:tool:";
const UP_TAG = "§8eco:up:";
const MAX_LEVEL = () => TOOL_LEVELS.xpNeeded.length;
const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const mobKey = (typeId) => typeId.replace(/^minecraft:/, "");
const mobInfo = (key) => SPAWNERS.find((s) => s.mob === key);
const placed = new Set(); // player-placed melons/pumpkins/cane/cactus (don't count)
const posKey = (dimId, l) => `${dimId}:${l.x},${l.y},${l.z}`;

// ---- collections -----------------------------------------------------------
export const colKey = (kind, id) => `eco:col:${kind}:${id}`;
export const getCol = (player, kind, id) => Number(player.getDynamicProperty(colKey(kind, id)) ?? 0);
export const tierOf = (n) => COLLECTION_TIERS.amounts.filter((a) => n >= a).length;

function addCol(player, kind, id, name, n = 1) {
  const before = getCol(player, kind, id);
  const after = before + n;
  player.setDynamicProperty(colKey(kind, id), after);
  const t0 = tierOf(before), t1 = tierOf(after);
  for (let t = t0 + 1; t <= t1; t++) {
    const reward = COLLECTION_TIERS.rewards[t - 1] ?? 0;
    if (reward) addMoney(player, reward);
    player.sendMessage(
      `§6§l✦ COLLECTION ✦ §r§f${name} §6${roman(t)}§7 reached! ` +
        `§a+${fmt(reward)}§7, §a+${COLLECTION_TIERS.bonusPerTier}% §7bonus ${name} drops`
    );
    player.playSound("random.levelup");
  }
}

/** Total of all crop collections ("farming") or all mob collections ("slayer"). */
export function collectionTotal(player, kind) {
  if (kind === "farming") return CROPS.reduce((n, c) => n + getCol(player, "crop", c.id), 0);
  return SPAWNERS.reduce((n, s) => n + getCol(player, "mob", s.mob), 0);
}

const roman = (n) => ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"][n] ?? String(n);

// ---- enchanted crops (like enchanted heads, but from farming) ----------------
export const enchantedId = (cropId) => `eco:enchanted_${cropId}`;
export const enchantedCrop = (typeId) => (typeId?.startsWith("eco:enchanted_") ? typeId.slice(14) : undefined);
export const cropName = (id) => CROPS.find((c) => c.id === id)?.name ?? id;
export const cropIcon = (id) => CROPS.find((c) => c.id === id)?.icon ?? "textures/ui/eco/icon_farming";
export const getCropPoints = (player, id) => Number(player.getDynamicProperty(`eco:crops:${id}`) ?? 0);
export function addCropPoints(player, id, n) {
  player.setDynamicProperty(`eco:crops:${id}`, Math.max(0, getCropPoints(player, id) + n));
}
export function allCropPoints(player) {
  return CROPS.map((c) => ({ id: c.id, points: getCropPoints(player, c.id) })).filter((c) => c.points > 0);
}

/** Enchanted crop items in the inventory: Map cropId -> count */
export function countEnchanted(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const out = new Map();
  if (!inv) return out;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    const id = enchantedCrop(it?.typeId);
    if (id) out.set(id, (out.get(id) ?? 0) + it.amount);
  }
  return out;
}

/** Turns enchanted crop items into balance. cropId = only that crop, else all. -> Map cropId -> count */
export function depositEnchanted(player, cropId) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const done = new Map();
  if (!inv) return done;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    const id = enchantedCrop(it?.typeId);
    if (!id || (cropId && id !== cropId)) continue;
    done.set(id, (done.get(id) ?? 0) + it.amount);
    inv.setItem(i, undefined);
  }
  for (const [id, n] of done) addCropPoints(player, id, n);
  return done;
}

// ---- tools ------------------------------------------------------------------
export function readTool(item) {
  if (!item) return undefined;
  const line = item.getLore().find((l) => l.startsWith(TAG));
  if (!line) return undefined;
  const [kind, lvl, xp, uses] = line.slice(TAG.length).split(":");
  if (!SKILL_TOOLS[kind]) return undefined;
  const ups = {};
  const upLine = item.getLore().find((l) => l.startsWith(UP_TAG));
  if (upLine) {
    for (const part of upLine.slice(UP_TAG.length).split(",")) {
      const [k, v] = part.split("=");
      if (k) ups[k] = Number(v) || 0;
    }
  }
  return { kind, level: Math.max(1, Number(lvl) || 1), xp: Math.max(0, Number(xp) || 0), uses: Math.max(0, Number(uses) || 0), ups };
}

/** Highest level the player's collection allows for this tool. */
export function levelCap(player, kind) {
  const total = collectionTotal(player, kind);
  let cap = 1;
  for (let l = 1; l <= MAX_LEVEL(); l++) {
    if (l <= TOOL_LEVELS.freeLevels || total >= (TOOL_LEVELS.collectionNeeded[l - 1] ?? 0)) cap = l;
    else break;
  }
  return cap;
}

function levelFromXp(xp) {
  let lvl = 1;
  for (let l = 1; l <= MAX_LEVEL(); l++) if (xp >= TOOL_LEVELS.xpNeeded[l - 1]) lvl = l;
  return lvl;
}

function bar(cur, next) {
  const filled = next > 0 ? Math.max(0, Math.min(10, Math.floor((cur / next) * 10))) : 10;
  return "§a" + "|".repeat(filled) + "§8" + "|".repeat(10 - filled);
}

/** Levels of an enchant upgrade above its vanilla maximum (they give the "over" bonus). */
export function overLevels(kind, ups, id) {
  const u = upgradeDef(kind, id);
  if (!u?.vanillaMax) return 0;
  return Math.max(0, (ups?.[id] ?? 0) - u.vanillaMax);
}
const overBonus = (kind, ups, id) => overLevels(kind, ups, id) * (upgradeDef(kind, id)?.over ?? 0);

/**
 * Kit bonus for a skill tool: each worn upgradable-kit armor piece adds (kit level / 4).
 * Slayer Sword: Combat Kit armor (and Dungeon Kit armor); Farming Hoe: Farming Kit armor.
 * -> f between 0 and 10
 */
export function kitFactor(player, kind) {
  let f = 0;
  try {
    const eq = player.getComponent("minecraft:equippable");
    for (const slot of ["Head", "Chest", "Legs", "Feet"]) {
      const info = readItem(eq?.getEquipment(slot));
      if (!info?.kit) continue;
      let line;
      if (kind === "slayer") line = info.id === "-" ? "combat" : info.def?.dungeon ? "dungeon" : undefined;
      else line = info.id?.startsWith("farmer_") ? "farming" : undefined;
      if (line) f += Number(player.getDynamicProperty(`eco:kitlvl:${line}`) ?? 0) / 4;
    }
  } catch {}
  return Math.min(10, f);
}

function kitLine(player, kind) {
  const f = player ? kitFactor(player, kind) : 0;
  const b = TOOL_KIT_BONUS[kind];
  const kit = kind === "slayer" ? "Combat Kit" : "Farming Kit";
  if (!f) return `§8Wear ${kit} armor for a bonus`;
  const r = (n) => Math.round(n * 10) / 10;
  return kind === "slayer"
    ? `§9Kit: +${r(b.damage * f)}% dmg, +${r(b.drops * f)}% drops`
    : `§9Kit: +${r(b.drops * f)}% crops, +${r(b.xp * f)}% XP`;
}

/** Random coin chunk from the kit bonus. */
function kitCoins(player, kind) {
  const f = kitFactor(player, kind);
  const b = TOOL_KIT_BONUS[kind];
  if (!f || Math.random() * 100 >= b.coinChance * f) return;
  const line = kind === "slayer" ? "combat" : "farming";
  const lvl = Math.max(1, Number(player.getDynamicProperty(`eco:kitlvl:${line}`) ?? 1));
  const coins = Math.round((b.coins[0] + Math.random() * (b.coins[1] - b.coins[0])) * lvl);
  addMoney(player, coins);
  try {
    player.onScreenDisplay.setActionBar(`§6+${fmt(coins)} §7(kit bonus)`);
  } catch {}
}

function writeTool(stack, kind, level, xp, player, ups = {}, uses = 0) {
  const t = SKILL_TOOLS[kind];
  const next = TOOL_LEVELS.xpNeeded[level];
  const lore = [`§7Level: §e${level}§7/§e${MAX_LEVEL()}`];
  lore.push(kind === "slayer" ? `§7Kills with this sword: §f${commas(uses)}` : `§7Crops harvested: §f${commas(uses)}`);
  if (next === undefined) lore.push(`§7XP: §b${commas(xp)} §6MAX`);
  else if (xp >= next) lore.push(`§7XP: §b${commas(xp)} §6READY TO LEVEL UP`);
  else lore.push(`§7XP: §b${commas(xp)}§7/§b${commas(next)} ${bar(xp, next)}`);
  lore.push(`§7Bonus drops: §a+${level * t.bonusPerLevel}%`);
  if (kind === "farming") lore.push(`§7Auto-replant: ${level >= t.replantLevel || ups.replenish > 0 ? "§aYes" : `§cLv ${t.replantLevel}`}`);
  const upBonus = (id) => (ups[id] ?? 0) * (upgradeDef(kind, id)?.perLevel ?? 0);
  if (kind === "farming") lore[2] = `§7Bonus drops: §a+${level * t.bonusPerLevel + upBonus("harvester")}%`;
  if (kind === "slayer") {
    lore[lore.length - 1] = `§7Bonus drops: §a+${level * t.bonusPerLevel + upBonus("plunder")}%`;
    lore.splice(2, 0, `§7Damage: §c+${swordDamage(level, ups)}`);
    lore.push(`§7Head chance: §d+${level * t.headBonusPerLevel + upBonus("head_hunter")}%`);
  }
  const owned = (TOOL_UPGRADES[kind] ?? []).filter((u) => ups[u.id] > 0);
  // upgrade names, wrapped so no lore line is too long
  let row = "";
  for (const u of owned) {
    const part = `${u.name} ${roman(ups[u.id])}`;
    if (row && (row + ", " + part).length > 40) {
      lore.push("§9" + row);
      row = part;
    } else row = row ? `${row}, ${part}` : part;
  }
  if (row) lore.push("§9" + row);
  lore.push(kitLine(player, kind));
  // next level: how many total kills / crops it needs (your collection), and how many you have
  // the next level that needs a collection (e.g. Lv 4 needs 1,000 kills) and how far you are
  const gated = TOOL_LEVELS.collectionNeeded.findIndex((n, i) => i >= level && n > 0);
  if (gated >= 0) {
    const need = TOOL_LEVELS.collectionNeeded[gated];
    const have = player ? collectionTotal(player, kind) : 0;
    lore.push(`${have >= need ? "§a" : "§c"}Lv ${gated + 1}: ${commas(need)} ${kind === "farming" ? "crops" : "kills"} §8(you: ${commas(have)})`);
  }
  lore.push("§8Sneak + use to upgrade");
  lore.push(`${TAG}${kind}:${level}:${xp}:${uses}`);
  const upStr = Object.entries(ups).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(",");
  if (upStr) lore.push(UP_TAG + upStr);
  stack.setLore(lore.slice(0, 20).map((l) => (l.length > 50 ? l.slice(0, 50) : l)));
  stack.nameTag = `§r§6${t.name} §e[Lv ${level}]`;
  try {
    const dur = stack.getComponent("minecraft:durability");
    if (dur) dur.damage = 0; // never breaks
  } catch {}
  // vanilla enchantments bought in the upgrade menu
  try {
    const ench = stack.getComponent("minecraft:enchantable");
    for (const u of TOOL_UPGRADES[kind] ?? []) {
      if (!u.enchant || !ench) continue;
      const type = EnchantmentTypes.get(u.enchant);
      if (!type) continue;
      try {
        ench.removeEnchantment(type);
      } catch {}
      if (ups[u.id] > 0) ench.addEnchantment({ type, level: Math.min(ups[u.id], u.vanillaMax ?? ups[u.id]) });
    }
  } catch {}
}

export function makeTool(kind, player) {
  const stack = new ItemStack(SKILL_TOOLS[kind].item, 1);
  stack.keepOnDeath = true;
  writeTool(stack, kind, 1, 0, player);
  return stack;
}

function heldTool(player, kind, slot = player.selectedSlotIndex) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const item = inv?.getItem(slot);
  const t = readTool(item);
  return t && t.kind === kind ? { ...t, item, inv, slot } : undefined;
}

function addToolXp(player, held, mult = 1, counted = true) {
  const kind = held.kind;
  const kitXp = kind === "farming" ? kitFactor(player, kind) * (TOOL_KIT_BONUS.farming.xp ?? 0) : 0;
  const boost = 1 + ((held.ups.cultivating ?? 0) * (upgradeDef(kind, "cultivating")?.perLevel ?? 0) + kitXp) / 100;
  const xp = held.xp + Math.max(1, Math.round(SKILL_TOOLS[kind].xpPerUse * boost * mult));
  const target = Math.min(levelFromXp(xp), levelCap(player, kind));
  const level = Math.max(held.level, target);
  held.uses = (held.uses ?? 0) + (counted ? 1 : 0);
  writeTool(held.item, kind, level, xp, player, held.ups, held.uses);
  held.inv.setItem(held.slot, held.item);
  if (level > held.level) {
    player.sendMessage(`§6§l⬆ LEVEL UP! §r§6${SKILL_TOOLS[kind].name} §7is now §eLevel ${level}§7!`);
    player.playSound("random.levelup");
  }
  return level;
}

/** Extra enchanted-head % for spawner mobs (used by spawners.js). */
export function headChanceBonus(player) {
  try {
    const held = heldTool(player, "slayer");
    if (!held) return 0;
    return held.level * SKILL_TOOLS.slayer.headBonusPerLevel + (held.ups.head_hunter ?? 0) * (upgradeDef("slayer", "head_hunter")?.perLevel ?? 0);
  } catch {
    return 0;
  }
}

/** Number of extra drops for a bonus chance in % (100% = 1 guaranteed, 150% = 1 + 50% chance of 2) */
function rollExtra(pct) {
  let n = Math.floor(pct / 100);
  if (Math.random() * 100 < pct % 100) n++;
  return n;
}

// ---- upgrades -----------------------------------------------------------------
const upgradeDef = (kind, id) => (TOOL_UPGRADES[kind] ?? []).find((u) => u.id === id);

/** What an upgrade is paid with besides money: enchanted crops (u.crop) or mob heads (u.headMob). */
function currency(player, u) {
  if (u.crop) {
    return { have: getCropPoints(player, u.crop), take: (n) => addCropPoints(player, u.crop, -n), label: `Enchanted ${cropName(u.crop)}`, short: "e" };
  }
  return { have: getHeadPoints(player, u.headMob), take: (n) => addHeadPoints(player, u.headMob, -n), label: `${mobName(u.headMob)} heads`, short: "h" };
}

/** Lists the skill tools in the player's inventory to pick one to upgrade. */
export async function pickToolMenu(player, back) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const tiles = [];
  for (let i = 0; i < (inv?.size ?? 0); i++) {
    const it = inv.getItem(i);
    const t = readTool(it);
    if (!t) continue;
    tiles.push({
      text: it.nameTag ?? SKILL_TOOLS[t.kind].name,
      sub: `§7Level ${t.level}${i < 9 ? `\n§8Hotbar slot ${i + 1}` : "\n§8Inventory"}`,
      icon: SKILL_TOOLS[t.kind].icon,
      onClick: () => upgradeMenu(player, () => pickToolMenu(player, back), undefined, i),
    });
  }
  tiles.push(backTile(back));
  return tileMenu(player, {
    title: "Upgrade a Skill Tool",
    theme: "green",
    body: tiles.length > 1 ? "§7Pick the skill tool you want to upgrade." : "§cYou don't have a skill tool. Buy one in Shop > Skill Tools.",
    tiles,
  });
}

/** Opens the upgrade menu for a skill tool (in `slot`, or the one in the player's hand). */
export async function upgradeMenu(player, back, msg, slot) {
  const held = ["slayer", "farming"].map((k) => heldTool(player, k, slot)).find(Boolean);
  if (!held) {
    if (slot === undefined) return pickToolMenu(player, back);
    fail(player, "That tool isn't in that slot any more - pick it again.");
    return back?.();
  }
  slot = held.slot;
  const kind = held.kind;
  const t = SKILL_TOOLS[kind];
  const defs = (TOOL_UPGRADES[kind] ?? []).filter((u) => !u.disabled);
  const reopen = (m) => upgradeMenu(player, back, m, slot);
  const tiles = defs.map((u) => {
    const cur = held.ups[u.id] ?? 0;
    if (cur >= u.max) return { text: `§a§l${u.name.toUpperCase()}`, sub: `§a${roman(cur)} §7MAX`, icon: u.icon, onClick: () => upgradeDetail(player, kind, u, () => reopen(), undefined, slot) };
    const c = currency(player, u);
    const ok = getBalance(player) >= u.money[cur] && c.have >= u.heads[cur];
    return {
      text: `§e§l${u.name.toUpperCase()}`,
      sub: `§7${cur ? roman(cur) : "-"} > ${ok ? "§a" : "§c"}${roman(cur + 1)}`,
      icon: u.icon,
      onClick: () => upgradeDetail(player, kind, u, () => reopen(), undefined, slot),
    };
  });
  if (back) tiles.push(backTile(back));
  await tileMenu(player, {
    title: `UPGRADE ${t.name.toUpperCase()}`,
    theme: kind === "slayer" ? "red" : "green",
    body:
      (msg ? msg + "\n" : "") +
      `§6${t.name} §eLv ${held.level}   §7Balance: §a${fmtMoney(getBalance(player))}\n` +
      (defs.length ? "§7Tap an upgrade to see what it does and buy it. §8(green = you can afford it)" : "§7No upgrades for this tool yet."),
    tiles,
  });
}

/** One upgrade: what it does, its cost, and a BUY button. */
async function upgradeDetail(player, kind, u, back, msg, slot) {
  const held = heldTool(player, kind, slot);
  if (!held) {
    fail(player, "That tool isn't in that slot any more - pick it again.");
    return back();
  }
  const cur = held.ups[u.id] ?? 0;
  const maxed = cur >= u.max;
  const c = currency(player, u);
  const reopen = (m) => upgradeDetail(player, kind, u, back, m, slot);
  const lines = [
    msg,
    `§f${u.name} §6${cur ? roman(cur) : "-"}§7/§6${roman(u.max)}`,
    `§7${u.desc ?? ""}`,
    u.overDesc ? `§d${u.overDesc}` : "",
  ];
  if (maxed) lines.push("§aFully upgraded!");
  else {
    const money = u.money[cur], need = u.heads[cur];
    lines.push(
      `§7Next: §e${u.name} ${roman(cur + 1)}`,
      `§7Cost: ${getBalance(player) >= money ? "§a" : "§c"}${fmt(money)} §7+ ${c.have >= need ? "§d" : "§c"}${need} ${c.label}`,
      `§8You have ${fmtMoney(getBalance(player))} and ${c.have} ${c.label}`
    );
  }
  const tiles = [];
  if (!maxed) {
    tiles.push({
      text: `§a§lBUY ${roman(cur + 1)}`,
      sub: `§a${fmt(u.money[cur])}`,
      icon: u.icon,
      onClick: () => reopen(buyUpgrade(player, kind, u, slot)),
    });
  }
  tiles.push(backTile(back));
  await tileMenu(player, { title: u.name.toUpperCase(), theme: kind === "slayer" ? "red" : "green", body: lines.filter(Boolean).join("\n"), tiles });
}

function buyUpgrade(player, kind, u, slot) {
  const held = heldTool(player, kind, slot);
  if (!held) return "§cThat tool isn't in that slot any more.";
  const cur = held.ups[u.id] ?? 0;
  if (cur >= u.max) return `§a${u.name} is already maxed.`;
  const money = u.money[cur], heads = u.heads[cur];
  const c = currency(player, u);
  if (c.have < heads) {
    fail(player, `You need ${heads} ${c.label} (you have ${c.have}).`);
    return `§cYou need §f${heads} ${c.label} §7(you have ${c.have})`;
  }
  if (!takeMoney(player, money)) {
    fail(player, `You need ${fmt(money)}.`);
    return `§cYou need §f${fmt(money)}§c.`;
  }
  c.take(heads);
  held.ups[u.id] = cur + 1;
  writeTool(held.item, kind, held.level, held.xp, player, held.ups, held.uses);
  held.inv.setItem(held.slot, held.item);
  success(player, `${SKILL_TOOLS[kind].name}: ${u.name} ${roman(cur + 1)}!`);
  player.playSound("random.anvil_use");
  return `§aUpgraded §f${u.name} §ato §f${roman(cur + 1)}§a!`;
}

// ---- crop growth --------------------------------------------------------------
/** The crop's growth state as [name, value], whatever the game version calls it. */
function growthState(perm, crop) {
  try {
    const v = perm.getState(crop.mature[0]);
    if (typeof v === "number") return [crop.mature[0], v];
  } catch {}
  try {
    const all = perm.getAllStates() ?? {};
    const k = Object.keys(all).find((n) => /growth|age/.test(n));
    if (k !== undefined && typeof all[k] === "number") return [k, all[k]];
  } catch {}
  return undefined;
}

/** Fully grown? (crops that don't grow in stages - melon, cane... - always count) */
function isGrown(perm, crop) {
  if (crop.grown) return true;
  const st = growthState(perm, crop);
  return st ? st[1] >= crop.mature[1] : true; // can't tell: count it
}

// ---- events ------------------------------------------------------------------
/** Skill tools never break: put their durability back after they're used. */
function repairHeldTool(player) {
  try {
    const inv = player.getComponent("minecraft:inventory")?.container;
    const slot = player.selectedSlotIndex;
    const item = inv?.getItem(slot);
    if (!readTool(item)) return;
    const dur = item.getComponent("minecraft:durability");
    if (!dur || dur.damage === 0) return;
    dur.damage = 0;
    inv.setItem(slot, item);
  } catch {}
}

/** Flat damage of a Slayer Sword: grows with its level and Sharpness. */
export function swordDamage(level, ups = {}) {
  const t = SKILL_TOOLS.slayer;
  return level * (t.damagePerLevel ?? 0) + (ups.sharpness ?? 0) * (t.damagePerSharpness ?? 0);
}

export function registerTools() {
  statSources.push((player) => {
    const held = heldTool(player, "slayer");
    return held ? { label: SKILL_TOOLS.slayer.name, stats: { dmg: swordDamage(held.level, held.ups) } } : undefined;
  });
  combatHooks.damageBonus.push((player) => {
    const held = heldTool(player, "slayer");
    if (!held) return 0;
    return overBonus("slayer", held.ups, "sharpness") + overBonus("slayer", held.ups, "fire_aspect") + kitFactor(player, "slayer") * TOOL_KIT_BONUS.slayer.damage;
  });
  world.afterEvents.playerBreakBlock.subscribe(({ player }) => system.run(() => repairHeldTool(player)));
  world.afterEvents.entityHitEntity?.subscribe(({ damagingEntity }) => {
    if (damagingEntity?.typeId === "minecraft:player") system.run(() => repairHeldTool(damagingEntity));
  });
  world.afterEvents.playerInteractWithBlock?.subscribe(({ player }) => system.run(() => repairHeldTool(player))); // tilling with the hoe
  // sneak + use (tap the air or a block) with a skill tool -> upgrade menu
  const open = (player) => upgradeMenu(player).catch((e) => console.warn("[eco] " + e));
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (source.isSneaking && readTool(itemStack)) open(source);
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.player.isSneaking || !readTool(ev.itemStack) || ev.block.typeId === "minecraft:mob_spawner") return;
    ev.cancel = true;
    if (ev.isFirstEvent) system.run(() => open(ev.player));
  });
  const tracked = new Set(CROPS.filter((c) => c.grown).map((c) => c.block));

  world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
    if (tracked.has(block.typeId)) placed.add(posKey(block.dimension.id, block.location));
  });

  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    const perm = ev.brokenBlockPermutation;
    const crop = CROPS.find((c) => c.block === perm.type.id);
    if (!crop) return;
    const key = posKey(ev.dimension.id, ev.block.location);
    const player = ev.player;
    const handPlaced = crop.grown && placed.delete(key);
    const grown = !handPlaced && isGrown(perm, crop);
    // The Farming Hoe gets XP from breaking ANY farmable block; fully grown crops give more.
    const held = heldTool(player, "farming");
    let level = 0;
    if (held) level = addToolXp(player, held, grown ? SKILL_TOOLS.farming.grownXpMultiplier ?? 1 : 1, grown);
    if (!grown) return; // unripe / hand-placed: hoe XP only, no rewards
    addCol(player, "crop", crop.id, crop.name);
    addSkillXp(player, "farming", SKILLS.farming.xp?.[crop.id] ?? 1);
    const harvester = held ? (held.ups.harvester ?? 0) * (upgradeDef("farming", "harvester")?.perLevel ?? 0) : 0;
    const extraPct = held ? overBonus("farming", held.ups, "fortune") + kitFactor(player, "farming") * TOOL_KIT_BONUS.farming.drops : 0;
    if (held) kitCoins(player, "farming");
    const pct =
      level * SKILL_TOOLS.farming.bonusPerLevel + harvester + extraPct + skillPerk(player, "farming") +
      tierOf(getCol(player, "crop", crop.id)) * COLLECTION_TIERS.bonusPerTier;
    const extra = rollExtra(pct);
    const at = { x: ev.block.x + 0.5, y: ev.block.y + 0.5, z: ev.block.z + 0.5 };
    const ft = SKILL_TOOLS.farming;
    if (Math.random() * 100 < (ft.enchantedChance ?? 0) + level * (ft.enchantedPerLevel ?? 0) + (held ? overBonus("farming", held.ups, "efficiency") : 0)) {
      try {
        ev.dimension.spawnItem(new ItemStack(enchantedId(crop.id), 1), at);
      } catch {}
    }
    if (extra > 0) {
      try {
        ev.dimension.spawnItem(new ItemStack(crop.drop, extra), at);
      } catch {}
    }
    // auto-replant (crops that grow in stages only)
    if (held && !crop.grown && (level >= SKILL_TOOLS.farming.replantLevel || held.ups.replenish > 0)) {
      const dim = ev.dimension, loc = ev.block.location;
      system.run(() => {
        try {
          const b = dim.getBlock(loc);
          if (b?.isAir) b.setPermutation(perm.withState(growthState(perm, crop)?.[0] ?? crop.mature[0], 0));
        } catch {
          try {
            dim.getBlock(loc)?.setPermutation(BlockPermutation.resolve(crop.block));
          } catch {}
        }
      });
    }
  });

  world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
    const killer = damageSource?.damagingEntity;
    if (killer?.typeId !== "minecraft:player") return;
    let key, at, dim;
    try {
      key = mobKey(deadEntity.typeId);
      at = deadEntity.location;
      dim = deadEntity.dimension;
    } catch {
      return;
    }
    const info = mobInfo(key);
    if (!info) return;
    addCol(killer, "mob", key, info.name);
    const held = heldTool(killer, "slayer");
    let level = 0;
    if (held) level = addToolXp(killer, held);
    addSkillXp(killer, "combat", SKILLS.combat.xp?.[key] ?? SKILLS.combat.xpDefault ?? 1);
    const plunder = held ? (held.ups.plunder ?? 0) * (upgradeDef("slayer", "plunder")?.perLevel ?? 0) : 0;
    const extraPct = held ? overBonus("slayer", held.ups, "looting") + kitFactor(killer, "slayer") * TOOL_KIT_BONUS.slayer.drops : 0;
    if (held) kitCoins(killer, "slayer");
    const pct =
      level * SKILL_TOOLS.slayer.bonusPerLevel + plunder + extraPct + skillPerk(killer, "combat") +
      tierOf(getCol(killer, "mob", key)) * COLLECTION_TIERS.bonusPerTier;
    const sets = rollExtra(pct);
    for (let s = 0; s < sets; s++) {
      for (const [item, min, max] of MOB_DROPS[key] ?? []) {
        const n = min + Math.floor(Math.random() * (max - min + 1));
        if (n > 0) {
          try {
            dim.spawnItem(new ItemStack(item, n), at);
          } catch {}
        }
      }
    }
  });
}

// ---- menus --------------------------------------------------------------------
export async function collectionsMenu(player, back) {
  const reopen = () => collectionsMenu(player, back);
  const farm = collectionTotal(player, "farming");
  const combat = collectionTotal(player, "slayer");
  await tileMenu(player, {
    title: "COLLECTIONS",
    theme: "gold",
    body:
      `§7Harvest crops and kill mobs to level up collections.\n` +
      `§7Each tier pays §amoney §7and gives §a+${COLLECTION_TIERS.bonusPerTier}% §7bonus drops.\n` +
      `§7Farming total: §e${commas(farm)}   §7Combat total: §c${commas(combat)}`,
    tiles: [
      { text: "§e§lFARMING", sub: `§7${commas(farm)} crops`, icon: "textures/ui/eco/icon_farming", onClick: () => colList(player, "crop", reopen) },
      { text: "§c§lCOMBAT", sub: `§7${commas(combat)} kills`, icon: "textures/ui/eco/icon_spawners", onClick: () => colList(player, "mob", reopen) },
      { text: "§6§lSKILL TOOLS", sub: "§7Levels & unlocks", icon: SKILL_TOOLS.farming.icon, onClick: () => toolsInfo(player, reopen) },
      { text: "§a§lENCHANTED", sub: "§7Crop balances", icon: "textures/items/wheat", onClick: () => enchantedMenu(player, reopen) },
      backTile(back),
    ],
  });
}

function enchantedMenu(player, back) {
  const list = allCropPoints(player);
  return tileMenu(player, {
    title: "ENCHANTED CROPS",
    theme: "green",
    body: list.length
      ? "§7Enchanted crops you've sold. Spend them on §6Farming Hoe §7upgrades\n§8(sneak + use the hoe)."
      : `§7Fully grown crops have a §a${SKILL_TOOLS.farming.enchantedChance}% §7chance to drop an §aEnchanted crop§7\n§7(more with the Farming Hoe). Sell them to add them here.`,
    tiles: [...list.map((c) => ({ text: `§a${cropName(c.id)}`, sub: `§f${commas(c.points)}`, icon: cropIcon(c.id), onClick: () => enchantedMenu(player, back) })), backTile(back)],
  });
}

function colList(player, kind, back) {
  const entries =
    kind === "crop"
      ? CROPS.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))
      : SPAWNERS.map((s) => ({ id: s.mob, name: s.name, icon: s.icon }));
  const reopen = () => colList(player, kind, back);
  const tiles = entries.map((e) => {
    const n = getCol(player, kind, e.id);
    const t = tierOf(n);
    return {
      text: `§f${e.name.length > 17 ? e.name.slice(0, 16) + "…" : e.name}`,
      sub: `${t ? `§6${roman(t)} ` : ""}§7${commas(n)}`,
      icon: e.icon,
      onClick: () => colDetail(player, kind, e, reopen),
    };
  });
  return tileMenu(player, {
    title: kind === "crop" ? "FARMING COLLECTIONS" : "COMBAT COLLECTIONS",
    theme: kind === "crop" ? "green" : "red",
    body: `§7Tap one to see its tiers and rewards.`,
    tiles: withNav(tiles, { back }),
  });
}

function colDetail(player, kind, e, back) {
  const n = getCol(player, kind, e.id);
  const t = tierOf(n);
  const lines = COLLECTION_TIERS.amounts.map((a, i) => {
    const done = n >= a;
    return `${done ? "§a✔" : "§8✘"} §f${roman(i + 1)} §7- ${commas(a)}  §a${fmt(COLLECTION_TIERS.rewards[i])} §7+ §a${COLLECTION_TIERS.bonusPerTier}% drops`;
  });
  const next = COLLECTION_TIERS.amounts[t];
  return tileMenu(player, {
    title: `${e.name.toUpperCase()} COLLECTION`,
    theme: kind === "crop" ? "green" : "red",
    body:
      `§f${e.name}: §e${commas(n)} ${kind === "crop" ? "harvested" : "killed"}   §7Tier §6${t ? roman(t) : "-"}\n` +
      `§7Bonus drop chance: §a+${t * COLLECTION_TIERS.bonusPerTier}%` +
      (next ? `   §7Next tier at §f${commas(next)}` : "   §6All tiers done!") +
      "\n" + lines.join("\n"),
    tiles: [backTile(back)],
  });
}

function toolsInfo(player, back) {
  const fmtLevels = (kind) => {
    const total = collectionTotal(player, kind);
    return TOOL_LEVELS.collectionNeeded
      .map((need, i) => {
        const lvl = i + 1;
        if (lvl <= TOOL_LEVELS.freeLevels) return null;
        return `${total >= need ? "§a✔" : "§8✘"} §fLv ${lvl}§7: ${commas(need)}`;
      })
      .filter(Boolean)
      .join("  ");
  };
  return tileMenu(player, {
    title: "SKILL TOOLS",
    theme: "gold",
    body:
      `§7Skill tools gain XP when used and level up automatically.\n` +
      `§7Levels 1-${TOOL_LEVELS.freeLevels} are free; higher levels also need a total collection:\n` +
      `§e${SKILL_TOOLS.farming.name} §7(crops ${commas(collectionTotal(player, "farming"))}): ${fmtLevels("farming")}\n` +
      `§c${SKILL_TOOLS.slayer.name} §7(kills ${commas(collectionTotal(player, "slayer"))}): ${fmtLevels("slayer")}\n` +
      `§fTo upgrade a tool: Profile > Skill Tool Upgrades (or hold it, sneak and use it).\n` +
      `§8Buy them in Shop > Skill Tools.`,
    tiles: [{ text: "§a§lUPGRADE A TOOL", sub: "§7Pick from your inventory", icon: "textures/blocks/anvil_top_damaged_0", onClick: () => pickToolMenu(player, () => toolsInfo(player, back)) }, backTile(back)],
  });
}

/** Shop tiles for buying skill tools (used by menus.js). */
export function skillToolTiles(player, buy) {
  return Object.entries(SKILL_TOOLS).map(([kind, t]) => ({
    text: `§6§l${t.name.toUpperCase()}`,
    sub: `§a${fmt(t.price)}`,
    icon: t.icon,
    onClick: () => buy(kind),
  }));
}

