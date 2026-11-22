import { ItemStack, system, world } from "@minecraft/server";
import { COLLECTION_TIERS, CROPS, SKILLS, SKILL_SETTINGS as SS, SKILL_TOOLS, SPAWNERS, TOOL_LEVELS } from "./config.js";
import { rankOn } from "./leaderboards.js";
import { pref } from "./playerSettings.js";
import { pauseSidebar } from "./sidebar.js";
import { collectionTotal, getCol } from "./tools.js";
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

// Other systems (stats, pets, mayor...) plug in here:
//   xpBonus(player, id)   -> extra XP %          perkBonus(player, id) -> extra perk %
//   onXp(player, id, gain)                       onCatch(player, location) -> fishing catch
export const skillHooks = { xpBonus: [], perkBonus: [], onXp: [], onCatch: [] };
const hookSum = (list, ...args) => list.reduce((n, f) => {
  try {
    return n + (Number(f(...args)) || 0);
  } catch {
    return n;
  }
}, 0);
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
  return skillLevel(player, id) * (s.perkPerLevel ?? 0) + hookSum(skillHooks.perkBonus, player, id);
}

export function addSkillXp(player, id, amount) {
  const s = SKILLS[id];
  if (!s || s.disabled || amount <= 0) return;
  const gain = Math.max(1, Math.round(amount * (s.xpMultiplier ?? 1) * (1 + hookSum(skillHooks.xpBonus, player, id) / 100)));
  for (const f of skillHooks.onXp) {
    try {
      f(player, id, gain);
    } catch {}
  }
  const before = levelInfo(getSkillXp(player, id)).level;
  const total = getSkillXp(player, id) + gain;
  player.setDynamicProperty(`eco:skill:${id}`, total);
  const info = levelInfo(total);
  if (SS.showActionBar && pref(player, "xpbar", true)) {
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
    if (pref(player, "titles", true)) try {
      pauseSidebar(player, 60);
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
    for (const f of skillHooks.onCatch) {
      try {
        f(best, l);
      } catch {}
    }
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
    const pct = info.need ? Math.floor((info.into / info.need) * 100) : 100;
    return {
      text: `§b§l${s.name.toUpperCase()}`,
      sub: info.level >= SS.maxLevel ? `§fLv ${info.level} §6MAX` : `§fLv ${info.level} §7· §a${pct}%`,
      icon: s.icon,
      onClick: () => skillDetail(player, id, reopen),
    };
  });
  tiles.unshift({
    text: "§e§lMY PROGRESS",
    sub: "§7What to improve",
    icon: "textures/ui/eco/icon_top",
    onClick: () => progressMenu(player, reopen),
  });
  await tileMenu(player, {
    title: "SKILLS",
    theme: "blue",
    body: `§7Level skills by playing. Each level pays money and boosts a perk.\n§7Skill average: §b${avg.toFixed(1)}`,
    tiles: [...tiles, ...extraTiles.map((t) => ({ ...t, onClick: () => t.onClick(reopen) })), backTile(back)],
  });
}

// ---- "my progress": what the player should work on next ------------------------
function progressMenu(player, back) {
  const ids = skillIds().filter((id) => !SKILLS[id].disabled);
  const infos = ids.map((id) => ({ id, s: SKILLS[id], ...levelInfo(getSkillXp(player, id)) }));
  const avg = infos.length ? infos.reduce((n, x) => n + x.level, 0) / infos.length : 0;
  const maxed = infos.filter((x) => x.level >= SS.maxLevel).length;
  let rankLine = "";
  try {
    const r = rankOn(player, "skillAvg");
    if (r.rank) rankLine = `   §7Server rank: §6#${r.rank}§7/${r.total}`;
  } catch {}
  const short = (into, need) => {
    const f = need ? Math.max(0, Math.min(10, Math.floor((into / need) * 10))) : 10;
    return "§a" + "|".repeat(f) + "§8" + "|".repeat(10 - f);
  };

  const lines = [`§fSkill average §b${avg.toFixed(1)}${rankLine}   §7Maxed: §6${maxed}/${infos.length}`, "", "§e§lYOUR SKILLS"];
  for (const x of infos) {
    lines.push(
      x.need
        ? `§f${x.s.name} §bLv ${x.level} ${short(x.into, x.need)} §7${commas(x.need - x.into)} XP to Lv ${x.level + 1}`
        : `§f${x.s.name} §bLv ${x.level} §6MAX`
    );
  }

  // the three lowest skills
  const weakest = infos
    .filter((x) => x.need)
    .sort((a, b) => a.level - b.level || a.into / a.need - b.into / b.need)
    .slice(0, 3);
  if (weakest.length) {
    lines.push("", "§e§lIMPROVE NEXT");
    for (const x of weakest) {
      lines.push(`§c> §f${x.s.name} §7(Lv ${x.level}): §f${x.s.how}§7 - §a${x.s.perk} +${x.s.perkPerLevel}%§7 per level`);
    }
  }

  // collections closest to their next tier
  const cols = [
    ...CROPS.map((c) => ({ kind: "crop", id: c.id, name: c.name })),
    ...SPAWNERS.map((m) => ({ kind: "mob", id: m.mob, name: m.name })),
  ]
    .map((c) => {
      const n = getCol(player, c.kind, c.id);
      const t = COLLECTION_TIERS.amounts.filter((a) => n >= a).length;
      const next = COLLECTION_TIERS.amounts[t];
      return next ? { ...c, n, t, next, left: next - n, frac: n / next, reward: COLLECTION_TIERS.rewards[t] ?? 0 } : undefined;
    })
    .filter((c) => c && c.n > 0)
    .sort((a, b) => b.frac - a.frac)
    .slice(0, 3);
  if (cols.length) {
    lines.push("", "§e§lCLOSEST COLLECTION REWARDS");
    for (const c of cols) {
      lines.push(`§6> §f${c.name} §7${commas(c.n)}/${commas(c.next)} - §f${commas(c.left)} more §7for tier ${c.t + 1} (§a${fmt(c.reward)}§7)`);
    }
  } else lines.push("", "§7Harvest crops and kill mobs to start your collections.");

  // skill tool unlocks
  lines.push("", "§e§lSKILL TOOL UNLOCKS");
  for (const [kind, label] of [["farming", "crops harvested"], ["slayer", "mob kills"]]) {
    const total = collectionTotal(player, kind);
    const idx = TOOL_LEVELS.collectionNeeded.findIndex((need, i) => i + 1 > TOOL_LEVELS.freeLevels && total < need);
    lines.push(
      idx >= 0
        ? `§f${SKILL_TOOLS[kind].name} §7Lv ${idx + 1} unlocks at §f${commas(TOOL_LEVELS.collectionNeeded[idx])} ${label} §8(${commas(TOOL_LEVELS.collectionNeeded[idx] - total)} to go)`
        : `§f${SKILL_TOOLS[kind].name} §aall levels unlocked`
    );
  }

  return tileMenu(player, { title: "MY PROGRESS", theme: "blue", body: lines.join("\n"), tiles: [backTile(back)] });
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
