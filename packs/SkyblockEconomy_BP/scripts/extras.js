import { system, world } from "@minecraft/server";
import { getBank } from "./bank.js";
import { addMoney, fmt, getBalance } from "./economy.js";
import { container } from "./inventory.js";
import { deserializeItem, serializeItem } from "./itemData.js";
import { ITEMS, RARITIES, makeItem } from "./items.js";
import { mayorIs } from "./mayor.js";
import { getPets, petLevel } from "./pets.js";
import { accessoryStats } from "./accessories.js";
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
const ACC_REWARDS = ["speed_charm_1", "vital_1", "iron_1", "power_1", "keen_1", "wise_1"];

export async function dailyMenu(player, back) {
  const again = () => dailyMenu(player, back);
  const d = readJson(player, "eco:daily", { last: 0, streak: 0 });
  const now = Date.now();
  const ready = now - d.last >= 20 * HOUR;
  const keeps = now - d.last <= 48 * HOUR;
  const streak = ready ? (keeps ? d.streak + 1 : 1) : d.streak;
  const day = Math.min(30, streak);
  const coins = 1000 * day * (mayorIs("dawn") ? 2 : 1);
  const special = streak % 7 === 0;
  const wait = Math.max(0, d.last + 20 * HOUR - now);
  await tileMenu(player, {
    title: "DAILY REWARD",
    theme: "gold",
    body: [
      `§7Streak: §6§l${d.streak} day${d.streak === 1 ? "" : "s"}${ready && !keeps && d.streak ? " §r§c(missed - starts again)" : ""}`,
      ready ? `§7Today's reward (day ${streak}): §a${fmt(coins)}${special ? " §d+ an accessory and 25 Essence!" : ""}` : `§7Next reward in §e${Math.floor(wait / HOUR)}h ${Math.floor((wait % HOUR) / 60000)}m`,
      "§8Claim within 48 hours to keep your streak. Every 7th day is a special reward.",
      mayorIs("dawn") ? "§eMayor Dawn doubles daily rewards!" : "",
    ].filter(Boolean).join("\n"),
    tiles: [
      {
        text: ready ? "§a§lCLAIM" : "§8§lCLAIMED",
        sub: ready ? `§a${fmt(coins)}` : "§7Come back later",
        icon: ready ? ICON.confirm : ICON.cancel,
        badge: ready ? "NEW" : undefined,
        onClick: () => {
          if (!ready) return again();
          player.setDynamicProperty("eco:daily", JSON.stringify({ last: now, streak }));
          addMoney(player, coins);
          if (special) {
            give(player, makeItem(ACC_REWARDS[Math.floor(Math.random() * ACC_REWARDS.length)]));
            addEssence(player, 25);
          }
          success(player, `Daily reward claimed: ${fmt(coins)}${special ? " + accessory + 25 Essence" : ""}! Streak: ${streak}`);
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
const SP_KEY = "eco:spirits";
const spirits = () => readJson(world, SP_KEY, []);
const found = (p) => new Set(readJson(p, "eco:spf", []));
const SP_REWARD = { hp: 2, def: 1, str: 1, spd: 1 };

export async function spiritsMenu(player, back) {
  const again = () => spiritsMenu(player, back);
  const all = spirits();
  const f = found(player);
  const have = all.filter((s) => f.has(s.id)).length;
  const traded = Number(player.getDynamicProperty("eco:sptraded") ?? 0);
  const canTrade = Math.floor(f.size / 5) - traded;
  await tileMenu(player, {
    title: "SPIRITS",
    theme: "blue",
    body: [
      `§7Wandering Spirits are hidden around the world. Walk into the sparkles to collect them.`,
      `§7Found: §b${have}§7/§b${all.length}`,
      `§7Every 5 spirits can be traded for: §c+2 Health§7, §a+1 Defense§7, §c+1 Strength§7, §f+1 Speed§7 (forever).`,
      `§7Trades done: §f${traded}    §7Ready: §a${Math.max(0, canTrade)}`,
    ].join("\n"),
    tiles: [
      {
        text: "§b§lTRADE 5",
        sub: canTrade > 0 ? "§aReady!" : "§7Find more",
        icon: "textures/items/nether_star",
        badge: canTrade > 0 ? "NEW" : undefined,
        onClick: () => {
          if (canTrade <= 0) fail(player, "Find 5 more spirits first.");
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

function spiritTick() {
  const all = spirits();
  if (!all.length) return;
  for (const p of world.getAllPlayers()) {
    const f = found(p);
    const l = p.location;
    for (const s of all) {
      if (f.has(s.id) || s.dim !== p.dimension.id) continue;
      const d2 = (s.x - l.x) ** 2 + (s.y - l.y) ** 2 + (s.z - l.z) ** 2;
      if (d2 > 30 * 30) continue;
      try {
        p.spawnParticle("minecraft:villager_happy", { x: s.x + (Math.random() - 0.5) * 0.6, y: s.y + 0.5 + Math.random(), z: s.z + (Math.random() - 0.5) * 0.6 });
        p.spawnParticle("minecraft:endrod", { x: s.x, y: s.y + 1, z: s.z });
      } catch {}
      if (d2 < 2.5) {
        f.add(s.id);
        p.setDynamicProperty("eco:spf", JSON.stringify([...f]));
        const n = all.filter((x) => f.has(x.id)).length;
        p.sendMessage(`§b§lSPIRIT FOUND! §r§7(${n}/${all.length})${f.size % 5 === 0 ? " §aTrade 5 in Profile > Spirits!" : ""}`);
        p.playSound("random.orb", { pitch: 0.6 });
      }
    }
  }
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
  { id: "acc5", name: "Collector", desc: "Have 5 active accessories", goal: 5, cur: (p) => accessoryStats(p).count, coins: 100000 },
  { id: "slayer1", name: "Monster Hunter", desc: "Reach Slayer level 1 (any)", goal: 1, cur: (p) => Math.max(...Object.keys(SLAYERS).map((t) => slayerLevel(p, t))), coins: 25000 },
  { id: "slayer5", name: "Slayer", desc: "Reach Slayer level 5 (any)", goal: 5, cur: (p) => Math.max(...Object.keys(SLAYERS).map((t) => slayerLevel(p, t))), coins: 1000000 },
  { id: "dungeon1", name: "Into the Crypts", desc: "Reach Dungeon level 1", goal: 1, cur: (p) => dungeonLevel(p), coins: 25000, essence: 25 },
  { id: "dungeon10", name: "Crypt Crawler", desc: "Reach Dungeon level 10", goal: 10, cur: (p) => dungeonLevel(p), coins: 1000000, essence: 250 },
  { id: "spirit10", name: "Spirit Seeker", desc: "Find 10 Spirits", goal: 10, cur: (p) => found(p).size, coins: 100000 },
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
    let sea;
    try {
      sea = dead.getDynamicProperty("eco:sea");
    } catch {}
    if (typeof sea === "number" && CREATURES[sea]) {
      const c = CREATURES[sea];
      addMoney(player, c.coins);
      addSkillXp(player, "fishing", c.xp);
      if (Math.random() < 0.05 + sea * 0.05 && ITEMS.tide_charm) {
        give(player, makeItem("tide_charm"));
        player.sendMessage(`§d§lRARE DROP! §r${RARITIES[ITEMS.tide_charm.rarity].color}Tide Charm`);
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
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(spiritTick, 10));
}

// ---- admin tiles ----
export function adminSpiritTiles(player, back) {
  return [
    {
      text: "§b§lPLACE SPIRIT",
      sub: "§7On the block you stand on",
      icon: "textures/items/nether_star",
      onClick: () => {
        const all = spirits();
        const l = player.location;
        // spirits sit on a block: find the solid block under you (up to 6 blocks down)
        let ground;
        for (let y = Math.floor(l.y); y >= Math.floor(l.y) - 6; y--) {
          try {
            const b = player.dimension.getBlock({ x: Math.floor(l.x), y, z: Math.floor(l.z) });
            if (b && !b.isAir && !b.isLiquid) {
              ground = y;
              break;
            }
          } catch {}
        }
        if (ground === undefined) {
          fail(player, "Stand on a block to place a Spirit (there's no block under you).");
          return back();
        }
        all.push({ id: Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36), x: Math.floor(l.x) + 0.5, y: ground + 1.5, z: Math.floor(l.z) + 0.5, dim: player.dimension.id });
        world.setDynamicProperty(SP_KEY, JSON.stringify(all.slice(-300)));
        success(player, `Placed a Spirit (${all.length} in the world).`);
        return back();
      },
    },
    {
      text: "§c§lREMOVE SPIRIT",
      sub: "§7Nearest (10 blocks)",
      icon: ICON.cancel,
      onClick: () => {
        const all = spirits();
        const l = player.location;
        let best = -1, bd = 100;
        all.forEach((s, i) => {
          const d = (s.x - l.x) ** 2 + (s.y - l.y) ** 2 + (s.z - l.z) ** 2;
          if (s.dim === player.dimension.id && d < bd) {
            bd = d;
            best = i;
          }
        });
        if (best < 0) fail(player, "No spirit within 10 blocks.");
        else {
          all.splice(best, 1);
          world.setDynamicProperty(SP_KEY, JSON.stringify(all));
          success(player, "Removed the nearest Spirit.");
        }
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
