import { ItemStack, system, world } from "@minecraft/server";
import { SKILLS, SKILL_SETTINGS as SS } from "./config.js";
import { addMoney, fmt } from "./economy.js";
import { backTile, tileMenu } from "./ui.js";

// ============================================================================
//  SKILLS
//  Farming & Combat XP come from tools.js (it already detects grown crops and
//  player kills). Mining, Foraging, Excavating and Fishing are detected here.
//  Each player's total XP per skill:  eco:skill:<id>
// ============================================================================

const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const placed = new Set(); // blocks placed by players don't give XP
const posKey = (dimId, l) => `${dimId}:${l.x},${l.y},${l.z}`;

export const skillIds = () => Object.keys(SKILLS);
export const getSkillXp = (player, id) => Number(player.getDynamicProperty(`eco:skill:${id}`) ?? 0);

/** XP needed to go from level L to L+1 */
export const xpForNext = (level) => Math.round(SS.xpBase * Math.pow(level, SS.xpExponent));

/** -> { level, into, need } from total XP (levels start at 0) */
export function levelInfo(totalXp) {
  let level = 0, left = totalXp;
  while (level < SS.maxLevel && left >= xpForNext(level + 1)) {
    left -= xpForNext(level + 1);
    level++;
  }
  return { level, into: left, need: level < SS.maxLevel ? xpForNext(level + 1) : 0 };
}

export const skillLevel = (player, id) => levelInfo(getSkillXp(player, id)).level;

/** Total XP needed to reach a level (for admin "set level") */
export function xpToReach(level) {
  let t = 0;
  for (let l = 1; l <= level; l++) t += xpForNext(l);
  return t;
}

/** Perk % for a skill (e.g. 2% per level) */
export function skillPerk(player, id) {
  const s = SKILLS[id];
  if (!s || s.disabled) return 0;
  return skillLevel(player, id) * (s.perkPerLevel ?? 0);
}

export function addSkillXp(player, id, amount) {
  const s = SKILLS[id];
  if (!s || s.disabled || amount <= 0) return;
  const gain = Math.max(1, Math.round(amount * (s.xpMultiplier ?? 1)));
  const before = levelInfo(getSkillXp(player, id)).level;
  const total = getSkillXp(player, id) + gain;
  player.setDynamicProperty(`eco:skill:${id}`, total);
  const info = levelInfo(total);
  if (SS.showActionBar) {
    try {
      player.onScreenDisplay.setActionBar(
        info.need ? `§3+${gain} ${s.name} XP §7(${commas(info.into)}/${commas(info.need)})` : `§3+${gain} ${s.name} XP §6MAX`
      );
    } catch {}
  }
  for (let l = before + 1; l <= info.level; l++) {
    const reward = SS.moneyPerLevel * l;
    if (reward > 0) addMoney(player, reward);
    player.sendMessage(
      `§b§l⬆ SKILL UP! §r§f${s.name} §blevel ${l}§7! ` +
        `${reward ? `§a+${fmt(reward)}§7, ` : ""}§a${s.perk} +${s.perkPerLevel}% §7(now ${l * s.perkPerLevel}%)`
    );
    try {
      player.onScreenDisplay.setTitle(`§b${s.name} ${l}`, { subtitle: "§7Skill level up!", fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
    } catch {}
    player.playSound("random.levelup");
  }
}

/** Chance roll with % (100% = 1 guaranteed, 150% = 1 + 50% chance of 2) */
function rollExtra(pct) {
  let n = Math.floor(pct / 100);
  if (Math.random() * 100 < pct % 100) n++;
  return n;
}

const isLog = (id) => /_(log|stem)$/.test(id) || id === "minecraft:bamboo_block";

function hasSilkTouch(item) {
  try {
    return !!item?.getComponent("minecraft:enchantable")?.getEnchantment("silk_touch");
  } catch {
    return false;
  }
}

// ---- events ---------------------------------------------------------------------
export function registerSkills() {
  const tracked = (id) => SKILLS.mining.blocks[id] || SKILLS.excavating.blocks[id] || isLog(id);

  world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
    if (tracked(block.typeId)) placed.add(posKey(block.dimension.id, block.location));
  });

  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    const id = ev.brokenBlockPermutation.type.id;
    if (!tracked(id)) return;
    if (placed.delete(posKey(ev.dimension.id, ev.block.location))) return; // placed by a player
    const player = ev.player;
    let skill, xp, drop, count;
    if (SKILLS.mining.blocks[id]) {
      skill = "mining";
      [xp, drop, count] = SKILLS.mining.blocks[id];
    } else if (SKILLS.excavating.blocks[id]) {
      skill = "excavating";
      [xp, drop, count] = SKILLS.excavating.blocks[id];
    } else {
      skill = "foraging";
      xp = SKILLS.foraging.xpPerLog;
      drop = id;
      count = 1;
    }
    if (SKILLS[skill].disabled) return;
    addSkillXp(player, skill, xp);
    if (skill === "mining" && hasSilkTouch(ev.itemStackBeforeBreak)) return; // no doubling silk-touched ores
    const extra = rollExtra(skillPerk(player, skill));
    if (extra > 0) {
      try {
        ev.dimension.spawnItem(new ItemStack(drop, count * extra), { x: ev.block.x + 0.5, y: ev.block.y + 0.5, z: ev.block.z + 0.5 });
      } catch {}
    }
  });

  // Fishing: remember where fishing hooks are; an item appearing at a hook = a catch
  const hooks = []; // { dim, x, y, z, tick }
  system.runInterval(() => {
    const now = system.currentTick;
    while (hooks.length && now - hooks[0].tick > 20) hooks.shift();
    const dims = new Set(world.getAllPlayers().map((p) => p.dimension.id));
    for (const d of dims) {
      try {
        for (const h of world.getDimension(d).getEntities({ type: "minecraft:fishing_hook" })) {
          hooks.push({ dim: d, ...h.location, tick: now });
        }
      } catch {}
    }
    if (hooks.length > 200) hooks.splice(0, hooks.length - 200);
  }, 4);

  world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    if (entity.typeId !== "minecraft:item" || !hooks.length || SKILLS.fishing.disabled) return;
    let l, dimId;
    try {
      l = entity.location;
      dimId = entity.dimension.id;
    } catch {
      return;
    }
    if (!hooks.some((h) => h.dim === dimId && (h.x - l.x) ** 2 + (h.y - l.y) ** 2 + (h.z - l.z) ** 2 <= 9)) return;
    // the angler: nearest player holding a fishing rod
    let best, bestD = 40 * 40;
    for (const p of world.getAllPlayers()) {
      if (p.dimension.id !== dimId) continue;
      const held = p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex);
      if (held?.typeId !== "minecraft:fishing_rod") continue;
      const d = (p.location.x - l.x) ** 2 + (p.location.y - l.y) ** 2 + (p.location.z - l.z) ** 2;
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    if (!best) return;
    addSkillXp(best, "fishing", SKILLS.fishing.xpPerCatch);
    const extra = rollExtra(skillPerk(best, "fishing"));
    if (extra > 0) {
      try {
        const st = entity.getComponent("minecraft:item")?.itemStack;
        if (st) {
          st.amount = Math.min(st.maxAmount, st.amount * extra);
          best.dimension.spawnItem(st, best.location);
        }
      } catch {}
    }
  });
}

// ---- menus --------------------------------------------------------------------------
function bar(cur, next) {
  const filled = next > 0 ? Math.max(0, Math.min(20, Math.floor((cur / next) * 20))) : 20;
  return "§a" + "|".repeat(filled) + "§8" + "|".repeat(20 - filled);
}

export async function skillsMenu(player, back, extraTiles = []) {
  const reopen = () => skillsMenu(player, back, extraTiles);
  const ids = skillIds().filter((id) => !SKILLS[id].disabled);
  const avg = ids.length ? ids.reduce((n, id) => n + skillLevel(player, id), 0) / ids.length : 0;
  const tiles = ids.map((id) => {
    const s = SKILLS[id];
    const info = levelInfo(getSkillXp(player, id));
    return {
      text: `§b§l${s.name.toUpperCase()}`,
      sub: `§fLv ${info.level}${info.level >= SS.maxLevel ? " §6MAX" : ""}`,
      icon: s.icon,
      onClick: () => skillDetail(player, id, reopen),
    };
  });
  await tileMenu(player, {
    title: "SKILLS",
    theme: "blue",
    body: `§7Level skills by playing. Each level pays money and boosts a perk.\n§7Skill average: §b${avg.toFixed(1)}`,
    tiles: [...tiles, ...extraTiles.map((t) => ({ ...t, onClick: () => t.onClick(reopen) })), backTile(back)],
  });
}

function skillDetail(player, id, back) {
  const s = SKILLS[id];
  const info = levelInfo(getSkillXp(player, id));
  const next = info.level < SS.maxLevel;
  return tileMenu(player, {
    title: `${s.name.toUpperCase()} SKILL`,
    theme: "blue",
    body:
      `§f${s.name} §blevel ${info.level}§7/${SS.maxLevel}   §7Total XP: §3${commas(getSkillXp(player, id))}\n` +
      (next ? `${bar(info.into, info.need)} §7${commas(info.into)}/${commas(info.need)}\n` : "§6Max level!\n") +
      `§7How to earn XP: §f${s.how}\n` +
      `§7Perk: §a${s.perk} ${info.level * s.perkPerLevel}%` +
      (next ? `  §8(next level: ${(info.level + 1) * s.perkPerLevel}%, +${fmt(SS.moneyPerLevel * (info.level + 1))})` : ""),
    tiles: [backTile(back)],
  });
}
