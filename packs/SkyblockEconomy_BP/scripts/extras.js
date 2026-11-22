import { system, world } from "@minecraft/server";
import { getBank } from "./bank.js";
import { addMoney, fmt, getBalance } from "./economy.js";
import { container } from "./inventory.js";
import { deserializeItem, serializeItem } from "./itemData.js";
import { ITEMS, RARITIES, makeItem } from "./items.js";
import { mayorIs } from "./mayor.js";
import { getPets, petLevel } from "./pets.js";
import { SLAYERS, slayerLevel } from "./slayer.js";
import { addEssence, dungeonLevel } from "./dungeons.js";
import { addSkillXp, skillHooks, skillIds, skillLevel } from "./skills.js";
import { combatHooks, invalidate, makeTough, stat, statSources } from "./stats.js";
import { ICON, backTile, fail, success, tileMenu } from "./ui.js";

// ============================================================================
//  EXTRAS
//    Daily Reward   - claim once a day, bigger with your streak
//    Spirits        - hidden collectibles admins place around the world;
//                     every 5 found can be traded for permanent stats
//    Quests         - one-time milestones with rewards
//    Commissions    - 3 new tasks every day
//    Wardrobe       - save up to 9 armor sets and swap in one tap
//    Sea Creatures  - fishing can pull up tough sea monsters
// ============================================================================

const HOUR = 3600 * 1000;
const readJson = (holder, key, def) => {
  try {
    const raw = holder.getDynamicProperty(key);
    return typeof raw === "string" ? JSON.parse(raw) : def;
  } catch {
    return def;
  }
};
const today = () => new Date().toISOString().slice(0, 10);

function give(player, stack) {
  if (!stack) return;
  const over = container(player)?.addItem(stack);
  if (over) player.dimension.spawnItem(over, player.location);
}

// ============================================================================
//  DAILY REWARD
// ============================================================================
export const DAILY_HOURS = 12; // time between claims
/** -> { ready, left: "3h 20m" } for the main menu tile */
export function dailyStatus(player) {
  const d = readJson(player, "eco:daily", { last: 0, streak: 0 });
  const wait = Math.max(0, d.last + DAILY_HOURS * HOUR - Date.now());
  return { ready: wait === 0, left: `${Math.floor(wait / HOUR)}h ${Math.floor((wait % HOUR) / 60000)}m` };
}
const DAILY_STREAK_HOURS = 36; // claim within this long to keep your streak

export async function dailyMenu(player, back) {
  const again = () => dailyMenu(player, back);
  const d = readJson(player, "eco:daily", { last: 0, streak: 0 });
  const now = Date.now();
  const ready = now - d.last >= DAILY_HOURS * HOUR;
  const keeps = now - d.last <= DAILY_STREAK_HOURS * HOUR;
  const streak = ready ? (keeps ? d.streak + 1 : 1) : d.streak;
  const day = Math.min(30, streak);
  const coins = 1000 * day * (mayorIs("dawn") ? 2 : 1);
  const special = streak % 7 === 0;
  const wait = Math.max(0, d.last + DAILY_HOURS * HOUR - now);
  const left = `${Math.floor(wait / HOUR)}h ${Math.floor((wait % HOUR) / 60000)}m`;
  await tileMenu(player, {
    title: "DAILY REWARD",
    theme: "gold",
    body: [
      `§7Streak: §6§l${d.streak} day${d.streak === 1 ? "" : "s"}${ready && !keeps && d.streak ? " §r§c(missed - starts again)" : ""}`,
      ready ? `§7Today's reward (day ${streak}): §a${fmt(coins)}${special ? ` §d+ ${fmt(coins * 2)} bonus and 25 Essence!` : ""}` : `§7Claimed! Next reward in §e${left}`,
      `§8Claim every ${DAILY_HOURS} hours. Claim within ${DAILY_STREAK_HOURS} hours to keep your streak. Every 7th claim is a special reward.`,
      mayorIs("dawn") ? "§eMayor Dawn doubles daily rewards!" : "",
    ].filter(Boolean).join("\n"),
    tiles: [
      {
        text: ready ? "§a§lCLAIM" : "§8§lCLAIMED",
        sub: ready ? `§a${fmt(coins)}` : `§7Next claim in §e${left}`,
        icon: ready ? ICON.confirm : ICON.cancel,
        badge: ready ? "NEW" : undefined,
        onClick: () => {
          if (!ready) return again();
          player.setDynamicProperty("eco:daily", JSON.stringify({ last: now, streak }));
          addMoney(player, coins);
          if (special) {
            addMoney(player, coins * 2);
            addEssence(player, 25);
          }
          success(player, `Daily reward claimed: ${fmt(coins)}${special ? ` + ${fmt(coins * 2)} bonus + 25 Essence` : ""}! Streak: ${streak}`);
          player.playSound("random.levelup");
          return again();
        },
      },
      backTile(back),
    ],
  });
}

// ============================================================================
//  SPIRITS
// ============================================================================
// Spirits drop from mobs killed in dungeons (SPIRIT_CHANCE %, bosses SPIRIT_BOSS_CHANCE %,
// both raised by Magic Find). Spirits found under the old "hidden in the world" system still count.
export const SPIRIT_CHANCE = 3;
export const SPIRIT_BOSS_CHANCE = 25;
const found = (p) => new Set(readJson(p, "eco:spf", [])); // old system: ids of spirits found in the world
export const spiritCount = (p) => found(p).size + Number(p.getDynamicProperty("eco:spcount") ?? 0);
export function addSpirit(p, n = 1) {
  p.setDynamicProperty("eco:spcount", Number(p.getDynamicProperty("eco:spcount") ?? 0) + n);
}
const SP_REWARD = { hp: 2, def: 1, str: 1, spd: 1 };

export async function spiritsMenu(player, back) {
  const again = () => spiritsMenu(player, back);
  const total = spiritCount(player);
  const traded = Number(player.getDynamicProperty("eco:sptraded") ?? 0);
  const canTrade = Math.floor(total / 5) - traded;
  await tileMenu(player, {
    title: "SPIRITS",
    theme: "blue",
    body: [
      `§7Spirits drop from mobs you kill in §5dungeons§7 (§b${SPIRIT_CHANCE}%§7 per mob, §b${SPIRIT_BOSS_CHANCE}%§7 per boss - more with Magic Find).`,
      `§7Spirits collected: §b${total}`,
      `§7Every 5 spirits can be traded for: §c+2 Health§7, §a+1 Defense§7, §c+1 Strength§7, §f+1 Speed§7 (forever).`,
      `§7Trades done: §f${traded}    §7Ready: §a${Math.max(0, canTrade)}`,
    ].join("\n"),
    tiles: [
      {
        text: "§b§lTRADE 5",
        sub: canTrade > 0 ? "§aReady!" : `§7${5 - (total % 5)} more to go`,
        icon: "textures/items/nether_star",
        badge: canTrade > 0 ? "NEW" : undefined,
        onClick: () => {
          if (canTrade <= 0) fail(player, "Collect 5 more spirits first (from dungeon mobs).");
          else {
            player.setDynamicProperty("eco:sptraded", traded + 1);
            invalidate(player);
            success(player, "The spirits make you stronger! +2 Health, +1 Defense, +1 Strength, +1 Speed.");
            player.playSound("random.levelup", { pitch: 1.6 });
          }
          return again();
        },
      },
      backTile(back),
    ],
  });
}


// ============================================================================
//  QUESTS (milestones)
// ============================================================================
const skillAvg = (p) => {
  const ids = skillIds();
  return ids.length ? ids.reduce((n, id) => n + skillLevel(p, id), 0) / ids.length : 0;
};
const QUESTS = [
  { id: "farm5", name: "Green Fingers", desc: "Reach Farming 5", goal: 5, cur: (p) => skillLevel(p, "farming"), coins: 25000 },
  { id: "mine5", name: "Deep Digger", desc: "Reach Mining 5", goal: 5, cur: (p) => skillLevel(p, "mining"), coins: 25000 },
  { id: "combat5", name: "Brawler", desc: "Reach Combat 5", goal: 5, cur: (p) => skillLevel(p, "combat"), coins: 25000 },
  { id: "forage5", name: "Timber!", desc: "Reach Foraging 5", goal: 5, cur: (p) => skillLevel(p, "foraging"), coins: 25000 },
  { id: "fish5", name: "Angler", desc: "Reach Fishing 5", goal: 5, cur: (p) => skillLevel(p, "fishing"), coins: 25000 },
  { id: "avg10", name: "Jack of All Trades", desc: "Skill average 10", goal: 10, cur: skillAvg, coins: 250000 },
  { id: "avg20", name: "Master of All", desc: "Skill average 20", goal: 20, cur: skillAvg, coins: 2500000 },
  { id: "bank1m", name: "Saver", desc: "Have $1M in the bank", goal: 1000000, cur: (p) => getBank(p), coins: 50000 },
  { id: "purse10m", name: "Tycoon", desc: "Have $10M in your purse", goal: 10000000, cur: (p) => getBalance(p), coins: 500000 },
  { id: "pet1", name: "Best Friend", desc: "Own a pet", goal: 1, cur: (p) => getPets(p).length, coins: 10000 },
  { id: "pet50", name: "Pet Trainer", desc: "Get a pet to level 50", goal: 50, cur: (p) => Math.max(0, ...getPets(p).map((x) => petLevel(x.xp, x.r).level)), coins: 500000 },
  { id: "slayer1", name: "Monster Hunter", desc: "Reach Slayer level 1 (any)", goal: 1, cur: (p) => Math.max(...Object.keys(SLAYERS).map((t) => slayerLevel(p, t))), coins: 25000 },
  { id: "slayer5", name: "Slayer", desc: "Reach Slayer level 5 (any)", goal: 5, cur: (p) => Math.max(...Object.keys(SLAYERS).map((t) => slayerLevel(p, t))), coins: 1000000 },
  { id: "dungeon1", name: "Into the Crypts", desc: "Reach Dungeon level 1", goal: 1, cur: (p) => dungeonLevel(p), coins: 25000, essence: 25 },
  { id: "dungeon10", name: "Crypt Crawler", desc: "Reach Dungeon level 10", goal: 10, cur: (p) => dungeonLevel(p), coins: 1000000, essence: 250 },
  { id: "spirit10", name: "Spirit Seeker", desc: "Collect 10 Spirits", goal: 10, cur: (p) => spiritCount(p), coins: 100000 },
];

// ---- commissions (daily) ----
const COMMISSIONS = [
  { k: "kill:minecraft:zombie", name: "Kill 40 Zombies", need: 40 },
  { k: "kill:minecraft:skeleton", name: "Kill 30 Skeletons", need: 30 },
  { k: "kill:minecraft:spider", name: "Kill 25 Spiders", need: 25 },
  { k: "kill:any", name: "Kill 100 mobs", need: 100 },
  { k: "break:stone", name: "Mine 300 stone or cobblestone", need: 300 },
  { k: "break:log", name: "Chop 96 logs", need: 96 },
  { k: "xp:farming", name: "Earn 400 Farming XP", need: 400 },
  { k: "xp:mining", name: "Earn 400 Mining XP", need: 400 },
  { k: "xp:fishing", name: "Earn 60 Fishing XP", need: 60 },
  { k: "xp:combat", name: "Earn 300 Combat XP", need: 300 },
];
const COMM_REWARD = 10000;
const COMM_BONUS = 25000;

function commissions(p) {
  const d = readJson(p, "eco:comm", undefined);
  if (d?.day === today()) return d;
  const pool = [...COMMISSIONS].sort(() => Math.random() - 0.5).slice(0, 3);
  const fresh = { day: today(), tasks: pool.map((c) => ({ k: c.k, have: 0, claimed: false })), bonus: false };
  p.setDynamicProperty("eco:comm", JSON.stringify(fresh));
  return fresh;
}
function bump(p, key, n = 1) {
  const d = commissions(p);
  let changed = false;
  for (const t of d.tasks) {
    const c = COMMISSIONS.find((x) => x.k === t.k);
    if (!c || t.have >= c.need || t.k !== key) continue;
    t.have = Math.min(c.need, t.have + n);
    changed = true;
    if (t.have >= c.need) {
      p.sendMessage(`§e§lCOMMISSION DONE! §r§7${c.name} §8- claim it in Quests`);
      p.playSound("random.orb");
    }
  }
  if (changed) p.setDynamicProperty("eco:comm", JSON.stringify(d));
}

export async function questsMenu(player, back) {
  const again = () => questsMenu(player, back);
  const done = new Set(readJson(player, "eco:quests", []));
  const d = commissions(player);
  const tiles = [];
  d.tasks.forEach((t, i) => {
    const c = COMMISSIONS.find((x) => x.k === t.k);
    if (!c) return;
    const complete = t.have >= c.need;
    tiles.push({
      text: `${t.claimed ? "§8" : complete ? "§a" : "§e"}§lCOMMISSION ${i + 1}`,
      sub: t.claimed ? "§8Claimed" : `§7${t.have}/${c.need}`,
      icon: "textures/items/paper",
      badge: complete && !t.claimed ? "NEW" : undefined,
      onClick: () => {
        const cur = commissions(player);
        const ct = cur.tasks[i];
        if (ct.claimed) return again();
        if (ct.have < c.need) {
          fail(player, `${c.name}: ${ct.have}/${c.need}`);
          return again();
        }
        ct.claimed = true;
        addMoney(player, COMM_REWARD);
        let msg = `Commission complete! +${fmt(COMM_REWARD)}`;
        if (!cur.bonus && cur.tasks.every((x) => x.claimed)) {
          cur.bonus = true;
          addMoney(player, COMM_BONUS);
          msg += ` and +${fmt(COMM_BONUS)} for finishing all 3 today!`;
        }
        player.setDynamicProperty("eco:comm", JSON.stringify(cur));
        success(player, msg);
        return again();
      },
    });
  });
  for (const q of QUESTS) {
    const cur = Math.floor(q.cur(player));
    const claimed = done.has(q.id);
    const complete = cur >= q.goal;
    tiles.push({
      text: `${claimed ? "§8" : complete ? "§a" : "§f"}${q.name}`,
      sub: claimed ? "§8Done" : complete ? "§aClaim!" : `§7${q.goal >= 1e5 ? Math.floor((cur / q.goal) * 100) + "%" : `${Math.min(cur, q.goal)}/${q.goal}`}`,
      icon: claimed ? ICON.confirm : "textures/items/book_writable",
      badge: complete && !claimed ? "NEW" : undefined,
      onClick: () => {
        if (claimed) return again();
        if (!complete) {
          fail(player, `${q.desc} (${Math.min(cur, q.goal)}/${q.goal})`);
          return again();
        }
        done.add(q.id);
        player.setDynamicProperty("eco:quests", JSON.stringify([...done]));
        addMoney(player, q.coins);
        if (q.essence) addEssence(player, q.essence);
        success(player, `Quest "${q.name}" complete! +${fmt(q.coins)}${q.essence ? ` +${q.essence} Essence` : ""}`);
        player.playSound("random.levelup");
        return again();
      },
    });
  }
  tiles.push(backTile(back));
  const lines = d.tasks.map((t) => {
    const c = COMMISSIONS.find((x) => x.k === t.k);
    return `§7- ${t.claimed ? "§8§m" : t.have >= c.need ? "§a" : "§f"}${c.name}§r §8(${t.have}/${c.need})`;
  });
  await tileMenu(player, {
    title: "QUESTS",
    theme: "green",
    body: `§e§lToday's commissions §r§7(${fmt(COMM_REWARD)} each, ${fmt(COMM_BONUS)} for all 3):\n${lines.join("\n")}\n§7Milestones done: §a${done.size}§7/§a${QUESTS.length}`,
    tiles,
  });
}

// ============================================================================
//  WARDROBE
// ============================================================================
const SLOTS = ["Head", "Chest", "Legs", "Feet"];
const WSLOTS = 9;

export async function wardrobeMenu(player, back) {
  const again = () => wardrobeMenu(player, back);
  const w = readJson(player, "eco:wardrobe", []);
  const tiles = [];
  for (let i = 0; i < WSLOTS; i++) {
    const set = w[i] ?? [];
    const n = set.filter(Boolean).length;
    const first = set.find(Boolean);
    tiles.push({
      text: `§b§lSLOT ${i + 1}`,
      sub: n ? `§a${n} pieces §7- tap: swap` : "§8Empty - tap: save",
      icon: first ? `textures/items/${first.id.replace("minecraft:", "").replace("golden_", "gold_")}` : "textures/items/empty_armor_slot_chestplate",
      onClick: () => {
        const eq = player.getComponent("minecraft:equippable");
        if (!eq) return again();
        const cur = readJson(player, "eco:wardrobe", []);
        const stored = cur[i] ?? [];
        const worn = SLOTS.map((s) => {
          const it = eq.getEquipment(s);
          return it ? serializeItem(it) : null;
        });
        if (!stored.some(Boolean) && !worn.some(Boolean)) {
          fail(player, "Wear some armor first, then tap an empty slot to save it.");
          return again();
        }
        SLOTS.forEach((s, k) => {
          try {
            eq.setEquipment(s, stored[k] ? deserializeItem(stored[k]) : undefined);
          } catch {}
        });
        cur[i] = worn;
        player.setDynamicProperty("eco:wardrobe", JSON.stringify(cur));
        invalidate(player);
        success(player, stored.some(Boolean) ? `Swapped to wardrobe slot ${i + 1}.` : `Saved your armor in slot ${i + 1}.`);
        player.playSound("armor.equip_iron");
        return again();
      },
    });
  }
  tiles.push(backTile(back));
  await tileMenu(player, {
    title: "WARDROBE",
    theme: "blue",
    body: "§7Tap a slot to swap the armor you're wearing with the set saved there.\n§7Tap an empty slot to store what you're wearing.",
    tiles,
  });
}

// ============================================================================
//  SEA CREATURES
// ============================================================================
const CREATURES = [
  { type: "minecraft:drowned", name: "§3Sea Walker", hp: 150, atk: 3, level: 0, coins: 500, xp: 30 },
  { type: "minecraft:guardian", name: "§3Tide Guardian", hp: 450, atk: 5, level: 5, coins: 2000, xp: 80 },
  { type: "minecraft:drowned", name: "§3§lDeep Lurker", hp: 1500, atk: 8, level: 10, coins: 6000, xp: 200 },
  { type: "minecraft:elder_guardian", name: "§5§lAbyssal Leviathan", hp: 8000, atk: 14, level: 18, coins: 30000, xp: 800 },
];

function onCatch(player, at) {
  const scc = 2 + Math.max(0, stat(player, "scc"));
  if (Math.random() * 100 >= scc) return;
  const lvl = skillLevel(player, "fishing");
  const pool = CREATURES.filter((c) => lvl >= c.level);
  const c = pool[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * pool.length)];
  try {
    const e = player.dimension.spawnEntity(c.type, { x: at.x, y: at.y + 0.5, z: at.z });
    makeTough(e, c.hp, c.name, c.atk);
    e.setDynamicProperty("eco:sea", CREATURES.indexOf(c));
    player.sendMessage(`§3§lA SEA CREATURE! §r${c.name} §7rose from the water!`);
    player.playSound("mob.guardian.curse", { volume: 0.4 });
  } catch {}
}


// ============================================================================
//  REGISTER
// ============================================================================
export function registerExtras() {
  statSources.push((player) => {
    const n = Number(player.getDynamicProperty("eco:sptraded") ?? 0);
    if (!n) return undefined;
    return { label: `Spirits (${n * 5})`, stats: Object.fromEntries(Object.entries(SP_REWARD).map(([k, v]) => [k, v * n])) };
  });
  combatHooks.kill.push((player, dead) => {
    let id;
    try {
      id = dead.typeId;
    } catch {
      return;
    }
    bump(player, "kill:any");
    bump(player, "kill:" + id);
    let dg, boss;
    try {
      dg = dead.getDynamicProperty("eco:dg");
      boss = dead.getDynamicProperty("eco:dgboss");
    } catch {}
    if (dg) {
      const chance = (boss ? SPIRIT_BOSS_CHANCE : SPIRIT_CHANCE) * (1 + Math.max(0, stat(player, "mf")) / 100);
      if (Math.random() * 100 < chance) {
        addSpirit(player);
        const n = spiritCount(player);
        player.sendMessage(`§b§lSPIRIT FOUND! §r§7A spirit drifted out of the ${boss ? "boss" : "mob"}. §8(${n} collected)${n % 5 === 0 ? " §aTrade 5 in Profile > Spirits!" : ""}`);
        player.playSound("random.orb", { pitch: 0.6 });
        try {
          player.dimension.spawnParticle("minecraft:totem_particle", dead.location);
        } catch {}
      }
    }
    let sea;
    try {
      sea = dead.getDynamicProperty("eco:sea");
    } catch {}
    if (typeof sea === "number" && CREATURES[sea]) {
      const c = CREATURES[sea];
      addMoney(player, c.coins);
      addSkillXp(player, "fishing", c.xp);
      if (Math.random() < 0.05 + sea * 0.05 && ITEMS.ancient_coin) {
        give(player, makeItem("ancient_coin"));
        player.sendMessage(`§d§lRARE DROP! §r${RARITIES[ITEMS.ancient_coin.rarity].color}Ancient Coin`);
      }
      player.sendMessage(`§3Sea creature slain! §a+${fmt(c.coins)} §3+${c.xp} Fishing XP`);
    }
  });
  skillHooks.onXp.push((player, id, gain) => bump(player, "xp:" + id, gain));
  skillHooks.onCatch.push(onCatch);
  world.afterEvents.playerBreakBlock.subscribe(({ player, brokenBlockPermutation }) => {
    const id = brokenBlockPermutation.type.id;
    if (id === "minecraft:stone" || id === "minecraft:cobblestone" || id === "minecraft:deepslate" || id === "minecraft:cobbled_deepslate") bump(player, "break:stone");
    else if (/_(log|stem)$/.test(id)) bump(player, "break:log");
  });
}

// ---- admin tiles ----
export function adminSpiritTiles(player, back) {
  return [
    {
      text: "§b§lGIVE SPIRIT",
      sub: "§7+1 for testing",
      icon: "textures/items/nether_star",
      onClick: () => {
        addSpirit(player);
        success(player, `You now have ${spiritCount(player)} spirits.`);
        return back();
      },
    },
  ];
}


/** Sidebar lines: the first unfinished daily commission (or undefined). */
export function commissionObjective(player) {
  try {
    const d = commissions(player);
    for (const t of d.tasks) {
      const c = COMMISSIONS.find((x) => x.k === t.k);
      if (c && t.have < c.need) return ["Objective", ` §e${c.name}`, ` §7(§e${t.have}§7/§a${c.need}§7)`];
    }
  } catch {}
  return undefined;
}
