import { system, world } from "@minecraft/server";
import { addMoney, fmt, fmtShort, getBalance, takeMoney } from "./economy.js";
import { container, freeSlots } from "./inventory.js";
import { ITEMS, RARITIES, isItem, makeItem } from "./items.js";
import { addPet } from "./pets.js";
import { combatHooks, makeTough, stat, statSources, toughName } from "./stats.js";
import { describeItem, itemIconFor } from "./forge.js";
import { mayorIs } from "./mayor.js";
import { ICON, backTile, fail, success, tileMenu } from "./ui.js";

// ============================================================================
//  SLAYER
//  Start a quest (pay coins), kill enough of that mob type, and a boss spawns
//  next to you. Beat it within the time limit for Slayer XP and boss drops.
//  Slayer levels give permanent stats and unlock the Slayer Shop, where boss
//  drops are made into gear.
//  Player data: eco:slq = current quest, eco:slxp:<type> = slayer XP
// ============================================================================

const TIERS = [
  { cost: 2000, kills: 10, hp: 400, atk: 2, xp: 5, level: 0 },
  { cost: 7500, kills: 25, hp: 1500, atk: 4, xp: 25, level: 1 },
  { cost: 20000, kills: 50, hp: 5000, atk: 7, xp: 100, level: 3 },
  { cost: 50000, kills: 100, hp: 15000, atk: 10, xp: 500, level: 5 },
  { cost: 150000, kills: 150, hp: 40000, atk: 15, xp: 1500, level: 7 },
];
const LEVEL_XP = [5, 15, 50, 200, 500, 1000, 5000, 10000, 25000];
const TIME_LIMIT = 180; // seconds to beat the boss
const questCost = (t) => Math.round(t.cost * (mayorIs("vex") ? 0.75 : 1));
const questXp = (t) => Math.round(t.xp * (mayorIs("vex") ? 1.25 : 1));
const roman = (n) => ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][n] ?? String(n);

export const SLAYERS = {
  zombie: {
    name: "Rotting Tyrant", mobName: "Zombies", icon: "textures/items/eco_heads/zombie", boss: "minecraft:zombie",
    mobs: ["minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:zombie_villager", "minecraft:zombie_villager_v2"],
    reward: { hp: 2 }, rewardText: "+2 Health per level",
    drops: [
      { id: "rotten_core", chance: 100, min: 2, max: 4, perTier: 2 },
      { id: "tyrant_fang", chance: 4, perTierChance: 3, minTier: 2 },
    ],
  },
  spider: {
    name: "Brood Mother", mobName: "Spiders", icon: "textures/items/eco_heads/spider", boss: "minecraft:spider",
    mobs: ["minecraft:spider", "minecraft:cave_spider"],
    reward: { cd: 2 }, rewardText: "+2% Crit Damage per level",
    drops: [
      { id: "venom_sac", chance: 100, min: 2, max: 4, perTier: 2 },
      { id: "silk_crown", chance: 4, perTierChance: 3, minTier: 2 },
    ],
  },
  skeleton: {
    name: "Bone Colossus", mobName: "Skeletons", icon: "textures/items/eco_heads/skeleton", boss: "minecraft:skeleton",
    mobs: ["minecraft:skeleton", "minecraft:stray", "minecraft:bogged", "minecraft:wither_skeleton"],
    reward: { str: 2 }, rewardText: "+2 Strength per level",
    drops: [
      { id: "marrow_shard", chance: 100, min: 2, max: 4, perTier: 2 },
      { id: "colossus_skull", chance: 4, perTierChance: 3, minTier: 2 },
    ],
  },
  enderman: {
    name: "Void Stalker", mobName: "Endermen", icon: "textures/items/eco_heads/enderman", boss: "minecraft:enderman",
    mobs: ["minecraft:enderman", "minecraft:endermite"],
    reward: { int: 5, def: 1 }, rewardText: "+5 Intelligence & +1 Defense per level", unlock: { type: "zombie", level: 3 },
    drops: [
      { id: "void_dust", chance: 100, min: 1, max: 3, perTier: 2 },
      { id: "void_heart", chance: 2, perTierChance: 2, minTier: 2 },
      { pet: "drake", chance: 0.2, perTierChance: 0.2, minTier: 3 },
    ],
  },
};

// Slayer shop recipes: item, slayer + level needed, materials [[id, n]], coins
export const SLAYER_SHOP = [
  { id: "tyrant_blade", type: "zombie", level: 3, mats: [["rotten_core", 64], ["tyrant_fang", 2]], coins: 250000 },
  { id: "tyrant_chestplate", type: "zombie", level: 4, mats: [["rotten_core", 128], ["tyrant_fang", 4]], coins: 500000 },
  { id: "venom_fang", type: "spider", level: 3, mats: [["venom_sac", 64], ["silk_crown", 2]], coins: 300000 },
  { id: "web_boots", type: "spider", level: 4, mats: [["venom_sac", 96], ["silk_crown", 3]], coins: 400000 },
  { id: "bone_bow", type: "skeleton", level: 3, mats: [["marrow_shard", 64], ["colossus_skull", 2]], coins: 300000 },
  { id: "bone_helmet", type: "skeleton", level: 4, mats: [["marrow_shard", 96], ["colossus_skull", 3]], coins: 400000 },
  { id: "void_leggings", type: "enderman", level: 4, mats: [["void_dust", 96], ["void_heart", 2]], coins: 2000000 },
  { id: "void_edge", type: "enderman", level: 5, mats: [["void_dust", 128], ["void_heart", 3]], coins: 5000000 },
];

// ---- data --------------------------------------------------------------------
export const slayerXp = (player, type) => Number(player.getDynamicProperty(`eco:slxp:${type}`) ?? 0);
export function slayerLevel(player, type) {
  const xp = slayerXp(player, type);
  let l = 0;
  while (l < LEVEL_XP.length && xp >= LEVEL_XP[l]) l++;
  return l;
}
function quest(player) {
  try {
    const raw = player.getDynamicProperty("eco:slq");
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
const saveQuest = (player, q) => player.setDynamicProperty("eco:slq", q ? JSON.stringify(q) : undefined);

// ---- items -------------------------------------------------------------------
export function countCustom(player, id) {
  const inv = container(player);
  let n = 0;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (isItem(it, id)) n += it.amount;
  }
  return n;
}
export function takeCustom(player, id, amount) {
  const inv = container(player);
  let left = amount;
  for (let i = 0; i < inv.size && left > 0; i++) {
    const it = inv.getItem(i);
    if (!isItem(it, id)) continue;
    if (it.amount <= left) {
      left -= it.amount;
      inv.setItem(i, undefined);
    } else {
      it.amount -= left;
      inv.setItem(i, it);
      left = 0;
    }
  }
  return amount - left;
}
export function giveCustomItem(player, id, amount) {
  let left = amount;
  while (left > 0) {
    const st = makeItem(id, left);
    if (!st) return;
    left -= st.amount;
    const over = container(player).addItem(st);
    if (over) player.dimension.spawnItem(over, player.location);
  }
}

// ---- quests ------------------------------------------------------------------
function startQuest(player, type, tier) {
  const s = SLAYERS[type];
  const t = TIERS[tier];
  if (quest(player)) return fail(player, "You already have a slayer quest. Finish or cancel it first.");
  if (slayerLevel(player, type) < t.level) return fail(player, `You need ${s.name} Slayer level ${t.level} for tier ${roman(tier + 1)}.`);
  if (s.unlock && slayerLevel(player, s.unlock.type) < s.unlock.level) return fail(player, `Unlocks at ${SLAYERS[s.unlock.type].name} Slayer level ${s.unlock.level}.`);
  if (!takeMoney(player, questCost(t))) return fail(player, `You need ${fmt(questCost(t))} to start this quest.`);
  saveQuest(player, { type, tier, kills: 0, phase: "kill" });
  success(player, `Slayer quest started! Kill ${t.kills} ${s.mobName} to summon the ${s.name}.`);
  player.playSound("mob.wither.spawn", { volume: 0.3, pitch: 1.5 });
}

function spawnBoss(player, q) {
  const s = SLAYERS[q.type];
  const t = TIERS[q.tier];
  const l = player.location;
  const dir = player.getViewDirection();
  let boss;
  try {
    boss = player.dimension.spawnEntity(s.boss, { x: l.x + dir.x * 3, y: l.y + 0.5, z: l.z + dir.z * 3 });
  } catch {
    try {
      boss = player.dimension.spawnEntity(s.boss, l);
    } catch {
      return false;
    }
  }
  makeTough(boss, t.hp, `§c☠ §l${s.name} ${roman(q.tier + 1)}§r`, t.atk);
  boss.setDynamicProperty("eco:slboss", player.id);
  try {
    boss.addEffect("speed", 20000000, { amplifier: Math.min(2, q.tier), showParticles: false });
    if (q.tier >= 3) boss.addEffect("strength", 20000000, { amplifier: 0, showParticles: false });
  } catch {}
  q.phase = "boss";
  q.boss = boss.id;
  q.until = Date.now() + TIME_LIMIT * 1000;
  q.summons = 0;
  saveQuest(player, q);
  try {
    player.onScreenDisplay.setTitle(`§c§l${s.name}`, { subtitle: `§7Tier ${roman(q.tier + 1)} - ${TIME_LIMIT / 60} minutes!`, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
  } catch {}
  player.playSound("mob.enderdragon.growl", { volume: 0.6 });
  return true;
}

function rollDrops(player, type, tier) {
  const mf = Math.max(0, stat(player, "mf"));
  const got = [];
  for (const d of SLAYERS[type].drops) {
    if (d.minTier && tier + 1 < d.minTier) continue;
    const chance = (d.chance + (d.perTierChance ?? 0) * tier) * (d.chance >= 100 ? 1 : 1 + mf / 100);
    if (Math.random() * 100 >= chance) continue;
    if (d.pet) {
      if (addPet(player, d.pet, 4, 0)) got.push("§6§lDRAKELING PET!");
      continue;
    }
    const n = (d.min ?? 1) + Math.floor(Math.random() * ((d.max ?? 1) - (d.min ?? 1) + 1)) + (d.perTier ?? 0) * tier;
    giveCustomItem(player, d.id, n);
    got.push(`${RARITIES[ITEMS[d.id].rarity].color}${n}x ${ITEMS[d.id].name}`);
    if (d.chance < 10) {
      player.sendMessage(`§d§lRARE DROP! §r${RARITIES[ITEMS[d.id].rarity].color}${ITEMS[d.id].name} §8(+${Math.round(mf)}% Magic Find)`);
      player.playSound("random.levelup", { pitch: 2 });
    }
  }
  return got;
}

function bossDied(boss, ownerId) {
  const player = world.getAllPlayers().find((p) => p.id === ownerId);
  if (!player) return;
  const q = quest(player);
  if (!q || q.boss !== boss.id) return;
  const s = SLAYERS[q.type];
  const t = TIERS[q.tier];
  const before = slayerLevel(player, q.type);
  player.setDynamicProperty(`eco:slxp:${q.type}`, slayerXp(player, q.type) + questXp(t));
  const after = slayerLevel(player, q.type);
  saveQuest(player, undefined);
  const coins = Math.floor(t.cost * 0.5);
  addMoney(player, coins);
  const drops = rollDrops(player, q.type, q.tier);
  player.sendMessage(`§a§lSLAYER QUEST COMPLETE! §r§7${s.name} ${roman(q.tier + 1)} defeated. §5+${questXp(t)} Slayer XP §a+${fmt(coins)}`);
  if (drops.length) player.sendMessage("§7Drops: " + drops.join("§7, "));
  if (after > before) {
    player.sendMessage(`§5§lSLAYER LEVEL UP! §r§7${s.name} Slayer §e${after}§7: ${s.rewardText}`);
    player.playSound("random.levelup");
  }
  try {
    player.onScreenDisplay.setTitle("§a§lBOSS SLAIN!", { subtitle: `§5+${t.xp} Slayer XP`, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
  } catch {}
}

function failQuest(player, q, why) {
  try {
    world.getEntity(q.boss)?.remove();
  } catch {}
  saveQuest(player, undefined);
  fail(player, `Slayer quest failed: ${why}`);
}

// ---- boss abilities -------------------------------------------------------------
function bossTick() {
  for (const player of world.getAllPlayers()) {
    const q = quest(player);
    if (!q) continue;
    if (q.phase === "kill") continue;
    const boss = world.getEntity(q.boss);
    if (Date.now() > q.until) {
      failQuest(player, q, "time ran out.");
      continue;
    }
    if (!boss?.isValid) {
      // the boss despawned (or the world restarted): bring it back
      if (!spawnBoss(player, q)) failQuest(player, q, "the boss vanished.");
      continue;
    }
    const left = Math.ceil((q.until - Date.now()) / 1000);
    try {
      player.onScreenDisplay.setActionBar(`§c☠ ${SLAYERS[q.type].name} §7- §e${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} §7left`);
    } catch {}
    if (system.currentTick % 100 >= 20) continue; // abilities every 5s
    const tier = q.tier;
    const ratio = Number(boss.getDynamicProperty("eco:vhp")) / Number(boss.getDynamicProperty("eco:vmax"));
    try {
      if (q.type === "zombie") {
        for (const p of boss.dimension.getPlayers({ location: boss.location, maxDistance: 4 })) p.applyDamage(2 + tier, { cause: "entityAttack", damagingEntity: boss });
        const max = Number(boss.getDynamicProperty("eco:vmax"));
        boss.setDynamicProperty("eco:vhp", Math.min(max, Number(boss.getDynamicProperty("eco:vhp")) + max * 0.02)); // heals 2%
        toughName(boss);
        boss.dimension.spawnParticle("minecraft:villager_angry", { ...boss.location, y: boss.location.y + 2 });
      } else if (q.type === "spider") {
        const due = ratio < 0.66 ? (ratio < 0.33 ? 2 : 1) : 0;
        if (q.summons < due) {
          q.summons++;
          saveQuest(player, q);
          for (let i = 0; i < 2 + tier; i++) {
            const m = boss.dimension.spawnEntity("minecraft:cave_spider", boss.location);
            makeTough(m, 40 * (tier + 1), "§cBroodling", 1 + tier);
          }
          player.sendMessage("§c§lThe Brood Mother calls her young!");
        }
        player.addEffect("slowness", 40, { amplifier: 0 });
      } else if (q.type === "skeleton") {
        const head = boss.getHeadLocation();
        const tgt = player.getHeadLocation();
        const v = { x: tgt.x - head.x, y: tgt.y - head.y + 0.5, z: tgt.z - head.z };
        const len = Math.hypot(v.x, v.y, v.z) || 1;
        for (let i = 0; i < 3; i++) {
          const a = boss.dimension.spawnEntity("minecraft:arrow", { x: head.x + v.x / len, y: head.y + v.y / len, z: head.z + v.z / len });
          a.getComponent("minecraft:projectile")?.shoot({ x: (v.x / len) * 2 + (i - 1) * 0.15, y: (v.y / len) * 2 + 0.1, z: (v.z / len) * 2 }, { uncertainty: 1 });
        }
      } else if (q.type === "enderman") {
        const l = player.location;
        const a = Math.random() * Math.PI * 2;
        boss.teleport({ x: l.x + Math.cos(a) * 3, y: l.y, z: l.z + Math.sin(a) * 3 });
        if (ratio < 0.5 && q.summons < 1) {
          q.summons++;
          saveQuest(player, q);
          for (let i = 0; i < 2 + tier; i++) makeTough(boss.dimension.spawnEntity("minecraft:endermite", boss.location), 60 * (tier + 1), "§5Voidling", 2 + tier);
        }
      }
    } catch {}
  }
}

// ---- menus -------------------------------------------------------------------
export async function slayerMenu(player, back) {
  const again = () => slayerMenu(player, back);
  const q = quest(player);
  const tiles = Object.entries(SLAYERS).map(([type, s]) => {
    const lvl = slayerLevel(player, type);
    return { text: `§c§l${s.name.toUpperCase()}`, sub: `§7Slayer Lv §5${lvl}`, icon: s.icon, onClick: () => slayerTypeMenu(player, type, again) };
  });
  if (q) {
    tiles.unshift({
      text: "§c§lCANCEL QUEST",
      sub: "§7No refund",
      icon: ICON.cancel,
      onClick: () => {
        const cur = quest(player);
        if (cur) failQuest(player, cur, "you cancelled it.");
        return again();
      },
    });
  }
  tiles.push({ text: "§6§lSLAYER SHOP", sub: "§7Make boss gear", icon: ICON.shop, onClick: () => slayerShopMenu(player, again) });
  tiles.push(backTile(back));
  const s = q && SLAYERS[q.type];
  await tileMenu(player, {
    title: "SLAYER",
    theme: "red",
    body: q
      ? q.phase === "kill"
        ? `§7Quest: §c${s.name} ${roman(q.tier + 1)}\n§7Kill ${s.mobName}: §e${q.kills}§7/§e${TIERS[q.tier].kills}`
        : `§7Quest: §c${s.name} ${roman(q.tier + 1)} §7- §c§lBOSS SPAWNED! §r§7Kill it before time runs out.`
      : "§7Start a quest, kill the mobs, then slay the boss for Slayer XP and rare drops.\n§7Slayer levels give permanent stats.",
    tiles,
  });
}

async function slayerTypeMenu(player, type, back) {
  const s = SLAYERS[type];
  const lvl = slayerLevel(player, type);
  const xp = slayerXp(player, type);
  const next = LEVEL_XP[lvl];
  const locked = s.unlock && slayerLevel(player, s.unlock.type) < s.unlock.level;
  await tileMenu(player, {
    title: s.name.toUpperCase(),
    theme: "red",
    body: [
      `§7Slayer level: §5${lvl}§7/§5${LEVEL_XP.length} §8(${xp}${next ? "/" + next : ""} XP)`,
      `§7Level bonus: §a${s.rewardText} §8(now: ${Object.entries(s.reward).map(([k, v]) => `+${v * lvl} ${k}`).join(", ")})`,
      `§7Kill: §f${s.mobName}`,
      locked ? `§cUnlocks at ${SLAYERS[s.unlock.type].name} Slayer level ${s.unlock.level}` : "",
    ].filter(Boolean).join("\n"),
    tiles: [
      ...TIERS.map((t, i) => ({
        text: `§c§lTIER ${roman(i + 1)}`,
        sub: lvl >= t.level ? `${getBalance(player) >= questCost(t) ? "§a" : "§c"}${fmtShort(questCost(t))} §7${fmtShort(t.hp)}❤` : `§8Needs Lv ${t.level}`,
        icon: s.icon,
        onClick: async () => {
          const ok = await tileMenu(player, {
            title: `${s.name.toUpperCase()} ${roman(i + 1)}`,
            theme: "red",
            body: `§7Kill §f${t.kills} ${s.mobName}§7, then beat the boss in §e${TIME_LIMIT / 60} minutes§7.\n§7Boss health: §c${fmtShort(t.hp)}❤    §7Boss hits: §c+${t.atk}\n§7Reward: §5${questXp(t)} Slayer XP§7, §a${fmt(Math.floor(t.cost / 2))}§7 and boss drops.\n§7Cost: §a${fmt(questCost(t))}`,
            tiles: [
              { text: "§a§lSTART", sub: `§a${fmtShort(questCost(t))}`, icon: ICON.confirm, id: "yes" },
              { text: "§c§lCANCEL", sub: "§7Go back", icon: ICON.cancel },
            ],
          });
          if (ok?.id === "yes") startQuest(player, type, i);
          return back();
        },
      })),
      backTile(back),
    ],
  });
}

async function slayerShopMenu(player, back) {
  const again = () => slayerShopMenu(player, back);
  const tiles = SLAYER_SHOP.filter((r) => ITEMS[r.id]).map((r) => {
    const d = ITEMS[r.id];
    const unlocked = slayerLevel(player, r.type) >= r.level;
    return {
      text: `${RARITIES[d.rarity].color}${d.name.slice(0, 18)}`,
      sub: unlocked ? `§a${fmtShort(r.coins)} §7+ mats` : `§8${SLAYERS[r.type].name} ${r.level}`,
      icon: itemIconFor(d),
      onClick: async () => {
        const have = r.mats.map(([id, n]) => [id, n, countCustom(player, id)]);
        const ok = await tileMenu(player, {
          title: d.name.toUpperCase().slice(0, 24),
          theme: "red",
          body: [
            describeItem(d),
            "",
            `§7Needs: §5${SLAYERS[r.type].name} Slayer ${r.level} ${unlocked ? "§a✔" : "§c✘"}`,
            ...have.map(([id, n, h]) => `§7- ${ITEMS[id].name}: ${h >= n ? "§a" : "§c"}${h}/${n}`),
            `§7- Coins: ${getBalance(player) >= r.coins ? "§a" : "§c"}${fmt(r.coins)}`,
          ].join("\n"),
          tiles: [
            { text: "§a§lCRAFT", sub: "§7Make it", icon: ICON.confirm, id: "yes" },
            backTile(),
          ],
        });
        if (ok?.id !== "yes") return again();
        if (!unlocked) fail(player, `You need ${SLAYERS[r.type].name} Slayer level ${r.level}.`);
        else if (have.some(([, n, h]) => h < n)) fail(player, "You don't have all the materials.");
        else if (getBalance(player) < r.coins) fail(player, `You need ${fmt(r.coins)}.`);
        else if (freeSlots(player) < 1) fail(player, "You need a free inventory slot.");
        else {
          takeMoney(player, r.coins);
          for (const [id, n] of r.mats) takeCustom(player, id, n);
          giveCustomItem(player, r.id, 1);
          success(player, `Crafted ${d.name}!`);
          player.playSound("random.anvil_use");
        }
        return again();
      },
    };
  });
  tiles.push(backTile(back));
  await tileMenu(player, { title: "SLAYER SHOP", theme: "red", body: "§7Turn slayer boss drops into gear. Higher slayer levels unlock better items.", tiles });
}

// ---- register -----------------------------------------------------------------
export function registerSlayer() {
  statSources.push((player) => {
    const stats = {};
    for (const [type, s] of Object.entries(SLAYERS)) {
      const l = slayerLevel(player, type);
      for (const [k, v] of Object.entries(s.reward)) if (l) stats[k] = (stats[k] ?? 0) + v * l;
    }
    return { label: "Slayer levels", stats };
  });
  combatHooks.kill.push((player, dead) => {
    const q = quest(player);
    if (!q || q.phase !== "kill") return;
    let id;
    try {
      id = dead.typeId;
      if (dead.getDynamicProperty("eco:slboss")) return;
    } catch {
      return;
    }
    if (!SLAYERS[q.type].mobs.includes(id)) return;
    q.kills++;
    const need = TIERS[q.tier].kills;
    if (q.kills >= need) {
      saveQuest(player, q);
      spawnBoss(player, q);
    } else {
      saveQuest(player, q);
      try {
        player.onScreenDisplay.setActionBar(`§c${SLAYERS[q.type].name}: §e${q.kills}§7/§e${need} ${SLAYERS[q.type].mobName}`);
      } catch {}
    }
  });
  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    let owner;
    try {
      owner = deadEntity.getDynamicProperty("eco:slboss");
    } catch {
      return;
    }
    if (owner) bossDied(deadEntity, String(owner));
  });
  // an old copy of a boss that was respawned (it was unloaded) is removed when it loads again
  world.afterEvents.entityLoad?.subscribe(({ entity }) => {
    try {
      const owner = entity.getDynamicProperty("eco:slboss");
      if (!owner) return;
      const p = world.getAllPlayers().find((x) => x.id === owner);
      const q = p ? quest(p) : undefined;
      if (!q || q.boss !== entity.id) entity.remove();
    } catch {}
  });
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(bossTick, 20));
}

/** Sidebar lines for an active slayer quest (or undefined). */
export function slayerObjective(player) {
  const q = quest(player);
  if (!q) return undefined;
  const s = SLAYERS[q.type];
  if (q.phase === "kill") return ["Slayer Quest", ` §c${s.name} ${roman(q.tier + 1)}`, ` §7(§e${q.kills}§7/§c${TIERS[q.tier].kills}§7) Kills`];
  const left = Math.max(0, Math.ceil((q.until - Date.now()) / 1000));
  return ["Slayer Quest", ` §c${s.name} ${roman(q.tier + 1)}`, ` §cSlay the boss! §e${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`];
}
