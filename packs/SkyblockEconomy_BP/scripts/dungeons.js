import { system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { addMoney, fmt, fmtShort, getBalance, takeMoney } from "./economy.js";
import { container, freeSlots } from "./inventory.js";
import { ITEMS, RARITIES, makeItem, readItem, renderItem } from "./items.js";
import { describeItem, itemIconFor } from "./forge.js";
import { addPet } from "./pets.js";
import { combatHooks, makeTough, stat, statSources } from "./stats.js";
import { mayorIs } from "./mayor.js";
import { adminRpgTiles } from "./profile.js";
import { ICON, backTile, fail, showForm, success, tileMenu } from "./ui.js";

// ============================================================================
//  DUNGEONS - "The Crypts", Floors I to V
//  A party of up to 5 is teleported to a dungeon built in the sky far away.
//  Rooms are built one after another along a corridor: clear a room (kill
//  every mob, or flip every lever in a puzzle room) and the door to the next
//  one opens. The last room holds the floor boss.
//    - Secret chests in some rooms raise your score.
//    - Getting "downed" (low health) sends you back to the room entrance and
//      costs score. You can't break or place blocks in a dungeon.
//    - Score (time, deaths, secrets) gives a grade S+ to D, which sets the
//      Dungeon XP, Essence and how good the reward chests are.
//  Classes give stats inside dungeons and level up with every run.
//  Essence buys dungeon gear and "stars" for dungeon items (+10% stats each).
// ============================================================================

const ROOM = 20; // room size (walls shared)
const HEIGHT = 8;
const BASE = { x: 30000, y: 200, z: 30000 };
const SLOTS = 8;

const FLOORS = [
  {
    name: "Floor I", level: 0, fee: 0, rooms: 5, mobHp: 60, atk: 2, mobs: ["minecraft:zombie", "minecraft:skeleton"], count: [3, 5],
    boss: { type: "minecraft:zombie", name: "§4§lThe Gravekeeper", hp: 2000, atk: 4 },
    pal: { wall: "stone_bricks", floor: "mossy_stone_bricks", accent: "cracked_stone_bricks", light: "sea_lantern" },
    xp: 40, essence: [5, 15], coins: 5000, chests: [25000, 75000],
    loot: [["crypt_blade", 5], ["crypt_helmet", 4], ["crypt_chestplate", 3], ["crypt_leggings", 3], ["crypt_boots", 4], ["crypt_ring", 2], ["gravebloom_hoe", 3], ["crypt_pick", 3], ["rotwood_axe", 3], ["drowned_rod", 2], ["crypt_lantern", 1], ["ancient_coin", 18], ["crypt_relic", 6], ["@essence", 20, 10, 30], ["@coins", 20, 5000, 15000]],
  },
  {
    name: "Floor II", level: 2, fee: 5000, rooms: 6, mobHp: 150, atk: 4, mobs: ["minecraft:zombie", "minecraft:skeleton", "minecraft:spider"], count: [4, 6],
    boss: { type: "minecraft:skeleton", name: "§4§lThe Bone Regent", hp: 6000, atk: 7 },
    pal: { wall: "deepslate_bricks", floor: "deepslate_tiles", accent: "cracked_deepslate_bricks", light: "sea_lantern" },
    xp: 90, essence: [10, 25], coins: 15000, chests: [75000, 200000],
    loot: [["crypt_chestplate", 3], ["crypt_leggings", 3], ["crypt_ring", 3], ["bonebreaker", 2], ["spirit_staff", 1], ["phantom_helmet", 1], ["phantom_boots", 1], ["gravebloom_hoe", 3], ["crypt_pick", 3], ["rotwood_axe", 3], ["drowned_rod", 3], ["crypt_lantern", 1.5], ["ancient_coin", 12], ["crypt_relic", 10], ["bone_idol", 4], ["@essence", 20, 20, 50], ["@coins", 18, 10000, 30000]],
  },
  {
    name: "Floor III", level: 5, fee: 25000, rooms: 7, mobHp: 400, atk: 7, mobs: ["minecraft:zombie", "minecraft:stray", "minecraft:wither_skeleton"], count: [4, 7],
    boss: { type: "minecraft:wither_skeleton", name: "§4§lThe Hollow King", hp: 18000, atk: 11 },
    pal: { wall: "polished_blackstone_bricks", floor: "blackstone", accent: "gilded_blackstone", light: "shroomlight" },
    xp: 180, essence: [20, 45], coins: 40000, chests: [200000, 600000],
    loot: [["bonebreaker", 3], ["spirit_staff", 2], ["phantom_helmet", 3], ["phantom_chestplate", 2], ["phantom_leggings", 2], ["phantom_boots", 3], ["phantom_scythe", 2], ["phantom_drill", 2], ["spectral_hatchet", 2], ["phantom_rod", 1.5], ["crypt_lantern", 2], ["ash_crown", 0.5], ["crypt_relic", 10], ["bone_idol", 8], ["hollow_crown_shard", 3], ["@essence", 20, 40, 90], ["@coins", 15, 30000, 80000]],
  },
  {
    name: "Floor IV", level: 9, fee: 100000, rooms: 8, mobHp: 1000, atk: 11, mobs: ["minecraft:husk", "minecraft:wither_skeleton", "minecraft:vindicator"], count: [5, 7],
    boss: { type: "minecraft:ravager", name: "§4§lThe Ash Warden", hp: 50000, atk: 16 },
    pal: { wall: "nether_bricks", floor: "red_nether_bricks", accent: "chiseled_nether_bricks", light: "shroomlight" },
    xp: 350, essence: [40, 90], coins: 100000, chests: [600000, 2000000],
    loot: [["phantom_chestplate", 3], ["phantom_leggings", 3], ["phantom_scythe", 3], ["phantom_drill", 3], ["spectral_hatchet", 3], ["phantom_rod", 2.5], ["sovereign_helmet", 1], ["sovereign_boots", 1], ["ash_crown", 1], ["kingsbane", 0.3], ["spirit_staff", 2], ["sovereign_lantern", 0.5], ["bone_idol", 8], ["hollow_crown_shard", 6], ["ashen_ember", 3], ["@essence", 20, 80, 160], ["@coins", 15, 80000, 200000]],
  },
  {
    name: "Floor V", level: 14, fee: 500000, rooms: 9, mobHp: 2500, atk: 16, mobs: ["minecraft:wither_skeleton", "minecraft:vindicator", "minecraft:blaze", "minecraft:enderman"], count: [5, 8],
    boss: { type: "minecraft:wither_skeleton", name: "§4§lThe Undying Sovereign", hp: 150000, atk: 24 },
    pal: { wall: "end_stone_bricks", floor: "purpur_block", accent: "purpur_pillar", light: "sea_lantern" },
    xp: 700, essence: [80, 180], coins: 250000, chests: [2000000, 6000000],
    loot: [["sovereign_helmet", 2], ["sovereign_chestplate", 1.5], ["sovereign_leggings", 1.5], ["sovereign_boots", 2], ["kingsbane", 1], ["ash_crown", 2], ["sovereign_sickle", 1.5], ["sovereign_excavator", 1.5], ["sovereign_timberaxe", 1.5], ["sovereign_rod", 1.2], ["sovereign_lantern", 1], ["@pet", 0.2, "drake"], ["hollow_crown_shard", 8], ["ashen_ember", 6], ["sovereign_jewel", 2], ["@essence", 20, 150, 300], ["@coins", 15, 200000, 500000]],
  },
];

export const CLASSES = {
  warrior: { name: "Warrior", icon: "textures/items/iron_sword", stats: { str: 30, def: 20 }, per: { str: 2, def: 1 }, desc: "Strong melee fighter" },
  mage: { name: "Mage", icon: "textures/items/blaze_rod", stats: { int: 150 }, per: { int: 10 }, desc: "Huge mana for staff abilities" },
  ranger: { name: "Ranger", icon: "textures/items/bow_standby", stats: { cd: 30, cc: 5 }, per: { cd: 2 }, desc: "Crits with bows and swords" },
  guardian: { name: "Guardian", icon: "textures/items/iron_chestplate", stats: { def: 80, hp: 10 }, per: { def: 4, hp: 1 }, desc: "Takes the hits" },
  cleric: { name: "Cleric", icon: "textures/items/golden_apple", stats: { hp: 10, int: 50 }, per: { hp: 1 }, desc: "Heals the party every 5 seconds" },
};

// Essence shop: [item id, essence]
const ESSENCE_SHOP = [
  ["crypt_helmet", 80], ["crypt_chestplate", 120], ["crypt_leggings", 100], ["crypt_boots", 80], ["crypt_blade", 150], ["crypt_ring", 200],
  ["spirit_staff", 1200], ["bonebreaker", 1500],
];
const STAR_COST = [25, 50, 100, 200, 400];
const GRADES = [["S+", 290, 1.6], ["S", 270, 1.4], ["A", 230, 1.2], ["B", 170, 1], ["C", 110, 0.8], ["D", 0, 0.5]];

// ---- levels ------------------------------------------------------------------
const LEVEL_XP = (l) => Math.round(50 * Math.pow(l, 1.8));
function levelFrom(xp) {
  let l = 0, left = xp;
  while (l < 30 && left >= LEVEL_XP(l + 1)) {
    left -= LEVEL_XP(l + 1);
    l++;
  }
  return { level: l, into: left, need: l < 30 ? LEVEL_XP(l + 1) : 0 };
}
export const dungeonXp = (p) => Number(p.getDynamicProperty("eco:dgxp") ?? 0);
export const dungeonLevel = (p) => levelFrom(dungeonXp(p)).level;
const classXp = (p, c) => Number(p.getDynamicProperty(`eco:dgc:${c}`) ?? 0);
const classLevel = (p, c) => levelFrom(classXp(p, c)).level;
export const getClass = (p) => (CLASSES[p.getDynamicProperty("eco:dgclass")] ? String(p.getDynamicProperty("eco:dgclass")) : "warrior");
export const getEssence = (p) => Number(p.getDynamicProperty("eco:essence") ?? 0);
export const addEssence = (p, n) => p.setDynamicProperty("eco:essence", Math.max(0, getEssence(p) + Math.floor(n)));

/** Extra % on Dungeon XP / Essence (the mayor can add to it). */
export const dungeonBonus = { essence: [], xp: [] };
const bonusPct = (list, p) => list.reduce((n, f) => n + (Number(f(p)) || 0), 0);

// ---- runs --------------------------------------------------------------------
const runs = new Map(); // run id -> run
const playerRun = new Map(); // player id -> run id
let runSeq = 0;

export const runOf = (player) => runs.get(playerRun.get(player.id));
export const inDungeon = (player) => !!runOf(player);

const dim = () => world.getDimension("minecraft:overworld");
const cmd = (c) => {
  try {
    return (dim().runCommand(c)?.successCount ?? 1) > 0;
  } catch {
    return false;
  }
};
const roomX = (run, i) => run.origin.x + i * ROOM;
const centerOf = (run, i) => ({ x: roomX(run, i) + ROOM / 2 + 0.5, y: run.origin.y + 1, z: run.origin.z + ROOM / 2 + 0.5 });
const entryOf = (run, i) => ({ x: roomX(run, i) + 2.5, y: run.origin.y + 1, z: run.origin.z + ROOM / 2 + 0.5 });
const runPlayers = (run) => run.players.map((id) => world.getAllPlayers().find((p) => p.id === id)).filter((p) => p?.isValid);

function party(run, msg) {
  for (const p of runPlayers(run)) p.sendMessage(msg);
}

function buildRoom(run, i) {
  const x0 = roomX(run, i), x1 = x0 + ROOM, y0 = run.origin.y, z0 = run.origin.z, z1 = z0 + ROOM, yt = y0 + HEIGHT;
  const P = run.floor.pal;
  const ok = cmd(`fill ${x0} ${y0} ${z0} ${x1} ${yt} ${z1} ${P.wall}`);
  if (!ok) return false;
  cmd(`fill ${x0 + 1} ${y0 + 1} ${z0 + 1} ${x1 - 1} ${yt - 1} ${z1 - 1} air`);
  cmd(`fill ${x0 + 1} ${y0} ${z0 + 1} ${x1 - 1} ${y0} ${z1 - 1} ${P.floor}`);
  for (const [dx, dz] of [[5, 5], [5, 15], [15, 5], [15, 15], [10, 10]]) cmd(`setblock ${x0 + dx} ${yt} ${z0 + dz} ${P.light}`);
  for (const [dx, dz] of [[3, 3], [3, 17], [17, 3], [17, 17]]) cmd(`fill ${x0 + dx} ${y0 + 1} ${z0 + dz} ${x0 + dx} ${yt - 1} ${z0 + dz} ${P.accent}`);
  const zc = z0 + ROOM / 2;
  if (i > 0) cmd(`fill ${x0} ${y0 + 1} ${zc - 1} ${x0} ${y0 + 4} ${zc + 1} air`); // way in
  if (i < run.rooms.length - 1) cmd(`fill ${x1} ${y0 + 1} ${zc - 1} ${x1} ${y0 + 4} ${zc + 1} iron_bars`); // door out (closed)
  const room = run.rooms[i];
  if (room.type === "puzzle") {
    room.levers = [];
    for (let k = 0; k < 3 + run.floorIndex; k++) {
      const lx = x0 + 2 + Math.floor(Math.random() * 16), lz = z0 + 2 + Math.floor(Math.random() * 16);
      if (cmd(`setblock ${lx} ${y0 + 1} ${lz} lever ["lever_direction"="up_north_south","open_bit"=false]`)) room.levers.push({ x: lx, y: y0 + 1, z: lz });
    }
  }
  if (room.secret) {
    const corners = [[1, 1], [1, ROOM - 1], [ROOM - 1, 1], [ROOM - 1, ROOM - 1]];
    const [dx, dz] = corners[Math.floor(Math.random() * 4)];
    room.secretAt = { x: x0 + dx, y: y0 + 1, z: z0 + dz };
    cmd(`setblock ${room.secretAt.x} ${room.secretAt.y} ${room.secretAt.z} chest`);
  }
  room.built = true;
  return true;
}

function openDoor(run, i) {
  const x1 = roomX(run, i) + ROOM, y0 = run.origin.y, zc = run.origin.z + ROOM / 2;
  cmd(`fill ${x1} ${y0 + 1} ${zc - 1} ${x1} ${y0 + 4} ${zc + 1} air`);
}

function spawnWave(run, i) {
  const room = run.rooms[i];
  const F = run.floor;
  const scale = 1 + (run.players.length - 1) * 0.35; // more players = tougher mobs
  room.mobs = [];
  const spawnOne = (type, hp, name, atk) => {
    const l = centerOf(run, i);
    const at = { x: l.x - 6 + Math.random() * 12, y: l.y, z: l.z - 6 + Math.random() * 12 };
    try {
      const e = dim().spawnEntity(type, at);
      makeTough(e, Math.round(hp * scale), name, atk);
      e.setDynamicProperty("eco:dg", run.id);
      room.mobs.push(e.id);
      return e;
    } catch {
      return undefined;
    }
  };
  const pretty = (t) => t.replace("minecraft:", "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (room.type === "boss") {
    const b = spawnOne(F.boss.type, F.boss.hp, F.boss.name, F.boss.atk);
    if (b) {
      b.setDynamicProperty("eco:dgboss", run.id);
      run.bossId = b.id;
      try {
        b.addEffect("speed", 20000000, { amplifier: 1, showParticles: false });
      } catch {}
    }
    for (const p of runPlayers(run)) {
      try {
        p.onScreenDisplay.setTitle(F.boss.name, { subtitle: "§7Defeat the boss!", fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
      } catch {}
      p.playSound("mob.wither.spawn", { volume: 0.5 });
    }
    return;
  }
  if (room.type === "puzzle") return;
  const [lo, hi] = F.count;
  const n = lo + Math.floor(Math.random() * (hi - lo + 1));
  for (let k = 0; k < n; k++) {
    const t = F.mobs[Math.floor(Math.random() * F.mobs.length)];
    spawnOne(t, F.mobHp, `§cCrypt ${pretty(t)}`, F.atk);
  }
  if (room.type === "elite") spawnOne(F.mobs[F.mobs.length - 1], F.mobHp * 6, "§6§lCrypt Champion", F.atk * 2);
}

function roomCleared(run, i) {
  const room = run.rooms[i];
  if (room.type === "puzzle") {
    if (!room.levers?.length) return true;
    return room.levers.every((l) => {
      try {
        return !!dim().getBlock(l)?.permutation.getState("open_bit");
      } catch {
        return false;
      }
    });
  }
  return (room.mobs ?? []).every((id) => {
    const e = world.getEntity(id);
    return !e || !e.isValid;
  });
}

function startRun(leader, floorIndex, members) {
  const F = FLOORS[floorIndex];
  const id = `r${++runSeq}`;
  const slot = runSeq % SLOTS;
  const origin = { x: BASE.x + slot * 1000, y: BASE.y, z: BASE.z };
  const rooms = [{ type: "entrance" }];
  const middle = ["mobs", "mobs", "elite", "puzzle", "mobs", "mobs", "puzzle", "elite"];
  for (let i = 1; i < F.rooms - 1; i++) {
    const type = i === 1 ? "mobs" : middle[Math.floor(Math.random() * middle.length)];
    rooms.push({ type, secret: type !== "puzzle" && Math.random() < 0.45 });
  }
  rooms.push({ type: "boss" });
  const run = { id, floor: F, floorIndex, players: members.map((p) => p.id), origin, rooms, cur: 0, start: 0, deaths: 0, secrets: 0, state: "building", buildTries: 0, entered: new Set() };
  runs.set(id, run);
  for (const p of members) {
    playerRun.set(p.id, id);
    const l = p.location;
    p.setDynamicProperty("eco:dgReturn", JSON.stringify({ x: l.x, y: l.y, z: l.z, dim: p.dimension.id }));
    try {
      p.addEffect("slow_falling", 200, { amplifier: 0, showParticles: false });
      p.addEffect("resistance", 200, { amplifier: 4, showParticles: false });
      p.teleport({ x: origin.x + 10.5, y: origin.y + 4, z: origin.z + 10.5 }, { dimension: dim() });
    } catch {}
    p.sendMessage(`§6§lDUNGEON §r§7Entering §f${F.name}§7... the crypt is forming around you.`);
  }
  return run;
}

function endRun(run, won) {
  if (run.state === "done") return;
  run.state = "done";
  // remove what's left
  for (const e of dim().getEntities({ location: centerOf(run, run.cur), maxDistance: 200 })) {
    try {
      if (e.getDynamicProperty("eco:dg") === run.id) e.remove();
    } catch {}
  }
  const elapsed = (Date.now() - run.start) / 1000;
  const par = run.rooms.length * 60;
  const time = Math.max(0, Math.min(100, 100 - Math.max(0, elapsed - par) / 6));
  const skill = Math.max(0, 100 - run.deaths * 15);
  const secretsTotal = run.rooms.filter((r) => r.secret).length;
  const explore = secretsTotal ? 50 + (50 * run.secrets) / secretsTotal : 100;
  const score = won ? Math.round(time + skill + explore) : 0;
  const [grade, , mult] = GRADES.find(([, min]) => score >= min);
  const F = run.floor;
  for (const p of runPlayers(run)) {
    playerRun.delete(p.id);
    if (won) {
      const xp = Math.round(F.xp * mult * (1 + bonusPct(dungeonBonus.xp, p) / 100));
      const before = dungeonLevel(p);
      p.setDynamicProperty("eco:dgxp", dungeonXp(p) + xp);
      const cls = getClass(p);
      p.setDynamicProperty(`eco:dgc:${cls}`, classXp(p, cls) + xp);
      const ess = Math.round((F.essence[0] + Math.random() * (F.essence[1] - F.essence[0])) * mult * (1 + bonusPct(dungeonBonus.essence, p) / 100));
      addEssence(p, ess);
      const coins = Math.round(F.coins * mult);
      addMoney(p, coins);
      p.setDynamicProperty("eco:dgReward", JSON.stringify({ floor: run.floorIndex, grade, opened: [] }));
      p.sendMessage(
        `§6§l${F.name} CLEARED! §r§7Score §e${score} §7(time ${Math.round(time)}, skill ${skill}, secrets ${Math.round(explore)}) Grade §6§l${grade}\n` +
          `§3+${xp} Dungeon XP §d+${ess} Essence §a+${fmt(coins)} §7- open your reward chests in §fDungeons > Rewards`
      );
      if (dungeonLevel(p) > before) p.sendMessage(`§3§lDUNGEON LEVEL UP! §r§7You are now Dungeon level §e${dungeonLevel(p)}`);
      try {
        p.onScreenDisplay.setTitle(`§6§l${grade}`, { subtitle: `§7${F.name} cleared!`, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
      } catch {}
      p.playSound("random.levelup");
    } else p.sendMessage("§c§lDUNGEON FAILED. §r§7Better luck next time.");
    const pl = p;
    system.runTimeout(() => sendBack(pl), won ? 100 : 20);
  }
  runs.delete(run.id);
}

function sendBack(p) {
  if (!p?.isValid) return;
  const raw = p.getDynamicProperty("eco:dgReturn");
  p.setDynamicProperty("eco:dgReturn", undefined);
  playerRun.delete(p.id);
  try {
    const r = JSON.parse(String(raw));
    p.teleport({ x: r.x, y: r.y, z: r.z }, { dimension: world.getDimension(r.dim ?? "minecraft:overworld") });
  } catch {
    try {
      const s = world.getDefaultSpawnLocation();
      p.teleport({ x: s.x, y: s.y > 300 ? 100 : s.y, z: s.z }, { dimension: dim() });
    } catch {}
  }
}

export function leaveRun(player) {
  const run = runOf(player);
  if (!run) return;
  run.players = run.players.filter((id) => id !== player.id);
  party(run, `§c${player.name} left the dungeon.`);
  sendBack(player);
  if (!run.players.length) endRun(run, false);
}

function down(player, run) {
  run.deaths++;
  const h = player.getComponent("minecraft:health");
  try {
    h?.resetToMaxValue();
    player.teleport(entryOf(run, run.cur), { dimension: dim() });
    player.addEffect("resistance", 60, { amplifier: 4, showParticles: false });
  } catch {}
  party(run, `§c☠ §f${player.name} §cwas downed! §7(-15 score)`);
}

// ---- tick ----------------------------------------------------------------------
function tickRun(run) {
  const players = runPlayers(run);
  if (!players.length) return endRun(run, false);
  if (run.state === "building") {
    run.buildTries++;
    for (const p of players) {
      try {
        p.addEffect("slow_falling", 60, { amplifier: 0, showParticles: false });
      } catch {}
    }
    if (run.buildTries > 30) {
      party(run, "§cThe dungeon couldn't be built here. Try again.");
      return endRun(run, false);
    }
    if (buildRoom(run, 0) && buildRoom(run, 1)) {
      run.state = "countdown";
      run.countdown = 5;
      for (const p of players) {
        try {
          p.teleport(centerOf(run, 0), { dimension: dim() });
        } catch {}
      }
    }
    return;
  }
  if (run.state === "countdown") {
    if (run.countdown > 0) {
      for (const p of players) {
        try {
          p.onScreenDisplay.setTitle(`§e${run.countdown}`, { subtitle: `§7${run.floor.name} - class: ${CLASSES[getClass(p)].name}`, fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 0 });
        } catch {}
      }
      run.countdown--;
      return;
    }
    run.state = "active";
    run.start = Date.now();
    openDoor(run, 0);
    run.cur = 1;
    party(run, "§a§lThe doors open! §r§7Clear each room to move on.");
    return;
  }
  if (run.state !== "active") return;
  if (Date.now() - run.start > 20 * 60 * 1000) {
    party(run, "§cTime's up! (20 minutes)");
    return endRun(run, false);
  }
  const i = run.cur;
  const room = run.rooms[i];
  if (!room.built && !buildRoom(run, i)) return;
  const x0 = roomX(run, i);
  // keep everyone (players and mobs) out of the void
  for (const p of players) {
    const l = p.location;
    if (l.y < run.origin.y - 3 || l.y > run.origin.y + HEIGHT + 2 || l.x < run.origin.x - 2 || l.x > x0 + ROOM + 1) {
      try {
        p.teleport(entryOf(run, i), { dimension: dim() });
      } catch {}
    }
  }
  for (const id of room.mobs ?? []) {
    const e = world.getEntity(id);
    if (!e?.isValid) continue;
    const l = e.location;
    if (l.x < x0 || l.x > x0 + ROOM || l.y < run.origin.y || l.y > run.origin.y + HEIGHT || l.z < run.origin.z || l.z > run.origin.z + ROOM) {
      try {
        e.teleport(centerOf(run, i));
      } catch {}
    }
  }
  if (!room.started) {
    if (!players.some((p) => p.location.x > x0 + 1.5)) return;
    room.started = true;
    spawnWave(run, i);
    if (room.type === "puzzle") party(run, "§e§lPUZZLE ROOM: §r§7flip every lever to open the door!");
    if (room.type === "elite") party(run, "§6§lA Crypt Champion guards this room!");
    return;
  }
  if (room.type === "boss") bossAbilities(run);
  if (!roomCleared(run, i)) return;
  if (room.type === "boss") return endRun(run, true);
  room.cleared = true;
  openDoor(run, i);
  run.cur++;
  for (const p of players) p.playSound("random.door_open");
  party(run, `§a✔ Room ${i} cleared! §7The next door is open.`);
  buildRoom(run, run.cur);
}

function bossAbilities(run) {
  const boss = world.getEntity(run.bossId);
  if (!boss?.isValid || system.currentTick % 120 >= 20) return;
  const F = run.floor;
  const ratio = Number(boss.getDynamicProperty("eco:vhp")) / Number(boss.getDynamicProperty("eco:vmax"));
  try {
    for (const p of boss.dimension.getPlayers({ location: boss.location, maxDistance: 5 })) {
      p.applyDamage(F.boss.atk, { cause: "entityAttack", damagingEntity: boss });
      p.applyKnockback({ x: p.location.x - boss.location.x, z: p.location.z - boss.location.z }, 0.6);
    }
    boss.dimension.spawnParticle("minecraft:huge_explosion_emitter", boss.location);
  } catch {}
  run.summons = run.summons ?? 0;
  const due = ratio < 0.75 ? (ratio < 0.5 ? (ratio < 0.25 ? 3 : 2) : 1) : 0;
  if (run.summons < due) {
    run.summons++;
    const room = run.rooms[run.cur];
    for (let k = 0; k < 2 + run.floorIndex; k++) {
      try {
        const t = F.mobs[Math.floor(Math.random() * F.mobs.length)];
        const e = dim().spawnEntity(t, boss.location);
        makeTough(e, F.mobHp, "§cRisen Servant", F.atk);
        e.setDynamicProperty("eco:dg", run.id);
        room.mobs.push(e.id);
      } catch {}
    }
    party(run, `${F.boss.name} §r§csummons its servants!`);
  }
}

function clericTick() {
  for (const run of runs.values()) {
    const players = runPlayers(run);
    const clerics = players.filter((p) => getClass(p) === "cleric");
    if (!clerics.length) continue;
    const heal = clerics.reduce((n, c) => n + 1 + classLevel(c, "cleric") * 0.2, 0);
    for (const p of players) {
      const h = p.getComponent("minecraft:health");
      if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + heal));
    }
  }
}

// ---- rewards -----------------------------------------------------------------
function pendingReward(p) {
  try {
    const raw = p.getDynamicProperty("eco:dgReward");
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

const CHESTS = [
  { id: "wood", name: "Wooden Chest", cost: () => 0, rolls: 1, rich: false, icon: "textures/blocks/planks_oak" },
  { id: "gold", name: "Gold Chest", cost: (F) => F.chests[0], rolls: 2, rich: false, icon: "textures/blocks/gold_block" },
  { id: "diamond", name: "Diamond Chest", cost: (F) => F.chests[1], rolls: 3, rich: true, icon: "textures/blocks/diamond_block", needGood: true },
];
const GOOD_GRADES = ["S+", "S", "A"];

/** Loot table weights for a chest (rare entries x3 in the Diamond Chest, Magic Find boosts rare ones). */
function lootWeights(F, rich, mf) {
  return F.loot.map((e) => {
    let w = e[1];
    if (w < 3) w *= (rich ? 3 : 1) * (1 + mf / 100);
    return [e, w];
  });
}

function lootName(e) {
  if (e[0] === "@essence") return `§d${e[2]}-${e[3]} Essence`;
  if (e[0] === "@coins") return `§6${fmtShort(e[2])}-${fmtShort(e[3])} coins`;
  if (e[0] === "@pet") return "§6Drakeling Pet";
  const d = ITEMS[e[0]];
  return d ? `${RARITIES[d.rarity].color}${d.name}` : e[0];
}

/** "Possible loot" lines with the chance per roll, rarest first. */
function chanceLines(p, F, chest) {
  const table = lootWeights(F, chest.rich, Math.max(0, stat(p, "mf")));
  const total = table.reduce((n, [, w]) => n + w, 0);
  return table
    .map(([e, w]) => [e, (w / total) * 100])
    .sort((a, b) => a[1] - b[1])
    .map(([e, pct]) => `${lootName(e)} §7${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`);
}

function rollLoot(p, F, rolls, rich) {
  const table = lootWeights(F, rich, Math.max(0, stat(p, "mf")));
  const total = table.reduce((n, [, w]) => n + w, 0);
  const got = [];
  for (let r = 0; r < rolls; r++) {
    let x = Math.random() * total;
    const [e] = table.find(([, w]) => (x -= w) <= 0) ?? table[table.length - 1];
    if (e[0] === "@essence") {
      const n = Math.round(e[2] + Math.random() * (e[3] - e[2]));
      addEssence(p, n);
      got.push(`§d${n} Essence`);
    } else if (e[0] === "@coins") {
      const n = Math.round(e[2] + Math.random() * (e[3] - e[2]));
      addMoney(p, n);
      got.push(`§6${fmt(n)}`);
    } else if (e[0] === "@pet") {
      if (addPet(p, e[2], 4, 0)) got.push("§6§lDrakeling Pet");
      else got.push("§c(Pet Menu full)");
    } else if (ITEMS[e[0]]) {
      const st = makeItem(e[0]);
      if (!st) continue;
      const over = container(p).addItem(st);
      if (over) p.dimension.spawnItem(over, p.location);
      const d = ITEMS[e[0]];
      got.push(`${RARITIES[d.rarity].color}${d.name}`);
      if (e[1] < 3) {
        p.sendMessage(`§d§lRARE REWARD! §r${RARITIES[d.rarity].color}${d.name}`);
        p.playSound("random.levelup", { pitch: 2 });
      }
    }
  }
  return got;
}

/** What's left to do with the pending reward: { free, paid, done } */
function rewardState(p) {
  const r = pendingReward(p);
  if (!r) return undefined;
  const good = GOOD_GRADES.includes(r.grade);
  const avail = CHESTS.filter((c) => !c.needGood || good);
  const left = avail.filter((c) => !r.opened.includes(c.id));
  return { r, free: left.some((c) => c.id === "wood"), paid: left.filter((c) => c.id !== "wood").length, done: left.length === 0 };
}

async function chestContents(player, F, chest, back) {
  await tileMenu(player, {
    title: chest.name,
    theme: "gold",
    body: [`§6§l${chest.name}§r §7- ${chest.rolls} roll${chest.rolls > 1 ? "s" : ""}${chest.rich ? ", rare loot x3" : ""}`, "§7Chance per roll (with your Magic Find):", ...chanceLines(player, F, chest)].join("\n"),
    tiles: [backTile(back)],
  });
}

async function rewardsMenu(player, back) {
  const again = () => rewardsMenu(player, back);
  const st = rewardState(player);
  if (!st) {
    return tileMenu(player, { title: "Rewards", theme: "gold", body: "§7No reward chests waiting. Clear a dungeon floor first!", tiles: [backTile(back)] });
  }
  const { r } = st;
  const F = FLOORS[r.floor];
  const good = GOOD_GRADES.includes(r.grade);
  const tiles = [];
  for (const c of CHESTS) {
    const opened = r.opened.includes(c.id);
    const locked = c.needGood && !good;
    const cost = c.cost(F);
    if (opened) {
      // already opened: show what came out, no click
      tiles.push({ text: `§8${c.name} §7(opened)`, sub: (r.loot?.[c.id] ?? []).map((x) => "§7- " + x).join("\n") || "§7Opened", icon: c.icon, noClick: true, onClick: again });
      continue;
    }
    tiles.push({
      text: `§6${c.name}`,
      sub: locked ? "§cNeeds grade A or better" : `${cost ? `${getBalance(player) >= cost ? "§a" : "§c"}${fmt(cost)}` : "§aFree"} §7- ${c.rolls} roll${c.rolls > 1 ? "s" : ""}`,
      icon: c.icon,
      onClick: async () => {
        if (locked) {
          fail(player, "The Diamond Chest needs grade A or better.");
          return again();
        }
        if (freeSlots(player) < c.rolls) {
          fail(player, `You need ${c.rolls} free inventory slots.`);
          return again();
        }
        const cur = pendingReward(player);
        if (!cur || cur.opened.includes(c.id)) return again();
        if (cost && !takeMoney(player, cost)) {
          fail(player, `You need ${fmt(cost)}.`);
          return again();
        }
        const got = rollLoot(player, F, c.rolls, c.rich);
        cur.opened.push(c.id);
        cur.loot = { ...(cur.loot ?? {}), [c.id]: got };
        const avail = CHESTS.filter((x) => !x.needGood || good);
        if (avail.every((x) => cur.opened.includes(x.id))) player.setDynamicProperty("eco:dgReward", undefined); // all done
        else player.setDynamicProperty("eco:dgReward", JSON.stringify(cur));
        player.playSound("random.chestopen");
        success(player, `${c.name}: ${got.join(", ").replace(/§./g, "")}`);
        // show what came out
        await tileMenu(player, {
          title: c.name,
          theme: "gold",
          body: `§6§lYou got:§r\n${got.map((x) => "§7- " + x).join("\n")}\n\n§8The items are in your inventory.`,
          tiles: [backTile(() => (pendingReward(player) ? again() : back()))],
        });
      },
    });
    tiles.push({ text: `§b${c.name} Loot`, sub: "§7See the chances", icon: "textures/items/book_writable", onClick: () => chestContents(player, F, c, again) });
  }
  tiles.push(backTile(back));
  await tileMenu(player, {
    title: `${F.name} Rewards`,
    theme: "gold",
    body: `§7Grade: §6§l${r.grade}§r    §7Purse: §a${fmtShort(getBalance(player))}\n§7Open each chest once. The loot goes straight into your inventory.\n§7Gold and Diamond chests cost coins; the Diamond Chest needs grade A+ and has 3x rare odds.\n§8Unopened chests are lost when you start your next run.`,
    tiles,
  });
}

// ---- stars -------------------------------------------------------------------
async function starMenu(player, back) {
  const again = () => starMenu(player, back);
  const inv = container(player);
  const slot = player.selectedSlotIndex;
  const it = inv.getItem(slot);
  const info = readItem(it);
  if (!info?.def?.dungeon) {
    return tileMenu(player, { title: "STAR ITEM", theme: "purple", body: "§7Hold a §fdungeon item§7 (from reward chests or the Essence Shop). Each star adds §a+10%§7 to its stats, up to 5 stars.", tiles: [backTile(back)] });
  }
  if (info.stars >= 5) return tileMenu(player, { title: "STAR ITEM", theme: "purple", body: "§6This item already has 5 stars!", tiles: [backTile(back)] });
  const cost = Math.round(STAR_COST[info.stars] * (1 + info.rarity) / 2);
  await tileMenu(player, {
    title: "STAR ITEM",
    theme: "purple",
    body: `§7Item: ${RARITIES[info.rarity].color}${info.def.name} §6${"✪".repeat(info.stars)}\n§7Next star: §d${cost} Essence §8(you have ${getEssence(player)})`,
    tiles: [
      {
        text: "§6§lADD STAR",
        sub: `§d${cost} Essence`,
        icon: "textures/items/nether_star",
        onClick: () => {
          const now = inv.getItem(slot);
          const ni = readItem(now);
          if (!ni?.def?.dungeon || ni.id !== info.id) fail(player, "Keep holding the item.");
          else if (getEssence(player) < cost) fail(player, `You need ${cost} Essence.`);
          else {
            addEssence(player, -cost);
            ni.stars++;
            renderItem(now, ni);
            inv.setItem(slot, now);
            success(player, `Added a star! (${ni.stars}/5)`);
            player.playSound("random.anvil_use");
          }
          return again();
        },
      },
      backTile(back),
    ],
  });
}

async function essenceShop(player, back) {
  const again = () => essenceShop(player, back);
  await tileMenu(player, {
    title: "ESSENCE SHOP",
    theme: "purple",
    body: `§7Essence: §d${getEssence(player)}`,
    tiles: [
      ...ESSENCE_SHOP.filter(([id]) => ITEMS[id]).map(([id, cost]) => {
        const d = ITEMS[id];
        return {
          text: `${RARITIES[d.rarity].color}${d.name.slice(0, 18)}`,
          sub: `${getEssence(player) >= cost ? "§d" : "§c"}${cost} Essence`,
          icon: itemIconFor(d),
          onClick: async () => {
            const ok = await tileMenu(player, { title: d.name.toUpperCase().slice(0, 24), theme: "purple", body: describeItem(d) + `\n\n§7Cost: §d${cost} Essence`, tiles: [{ text: "§a§lBUY", sub: `§d${cost}`, icon: ICON.confirm, id: "yes" }, backTile()] });
            if (ok?.id === "yes") {
              if (getEssence(player) < cost) fail(player, `You need ${cost} Essence.`);
              else if (freeSlots(player) < 1) fail(player, "You need a free inventory slot.");
              else {
                addEssence(player, -cost);
                container(player).addItem(makeItem(id));
                success(player, `Bought ${d.name}!`);
              }
            }
            return again();
          },
        };
      }),
      backTile(back),
    ],
  });
}

// ---- party & menus -----------------------------------------------------------
async function askJoin(p, leader, F) {
  const pick = await tileMenu(p, {
    title: "Dungeon Invite",
    theme: "purple",
    body: `§f${leader.name} §7invites you to §f${F.name}§7.${F.fee ? ` §7Entry fee: §a${fmt(F.fee)}` : ""}`,
    tiles: [
      { text: "§aJoin", sub: "§7Let's go!", icon: ICON.confirm, id: "yes" },
      { text: "§cNo Thanks", sub: "§7Stay here", icon: ICON.cancel, id: "no" },
    ],
  });
  return pick?.id === "yes";
}

async function playMenu(player, back) {
  const lvl = dungeonLevel(player);
  await tileMenu(player, {
    title: "CHOOSE A FLOOR",
    theme: "purple",
    body: `§7Dungeon level: §3${lvl}§7. Players within 10 blocks are invited to your party (max 5).`,
    tiles: [
      ...FLOORS.map((F, i) => ({
        text: `§5§l${F.name.toUpperCase()}`,
        sub: lvl >= F.level ? (F.fee ? `§a${fmtShort(F.fee)}` : "§aFree") : `§8Dungeon Lv ${F.level}`,
        icon: `textures/blocks/${F.pal.wall === "nether_bricks" ? "nether_brick" : F.pal.wall === "end_stone_bricks" ? "end_bricks" : F.pal.wall === "stone_bricks" ? "stonebrick" : "deepslate/deepslate_bricks"}`,
        onClick: async () => {
          if (runOf(player)) return fail(player, "You're already in a dungeon.");
          if (lvl < F.level) return fail(player, `You need Dungeon level ${F.level}.`);
          if (getBalance(player) < F.fee) return fail(player, `You need ${fmt(F.fee)} to enter.`);
          if (runs.size >= SLOTS) return fail(player, "All dungeons are busy right now. Try again soon.");
          const nearby = player.dimension
            .getPlayers({ location: player.location, maxDistance: 10 })
            .filter((p) => p.id !== player.id && !runOf(p) && dungeonLevel(p) >= F.level && getBalance(p) >= F.fee)
            .slice(0, 4);
          if (nearby.length) player.sendMessage(`§7Inviting ${nearby.map((p) => p.name).join(", ")}...`);
          const answers = await Promise.all(nearby.map((p) => askJoin(p, player, F).catch(() => false)));
          const members = [player, ...nearby.filter((_, k) => answers[k])].filter((p) => p.isValid && !runOf(p));
          for (const p of members) {
            if (F.fee && !takeMoney(p, F.fee)) {
              fail(p, "You couldn't pay the entry fee.");
              members.splice(members.indexOf(p), 1);
            }
          }
          if (!members.includes(player)) return;
          for (const p of members) p.setDynamicProperty("eco:dgReward", undefined);
          startRun(player, i, members);
        },
      })),
      backTile(back),
    ],
  });
}

async function classMenu(player, back) {
  const again = () => classMenu(player, back);
  const cur = getClass(player);
  await tileMenu(player, {
    title: "DUNGEON CLASS",
    theme: "purple",
    body: "§7Your class gives stats inside dungeons and levels up with every run you finish.",
    tiles: [
      ...Object.entries(CLASSES).map(([id, c]) => ({
        text: `${id === cur ? "§a§l" : "§f§l"}${c.name.toUpperCase()}`,
        sub: `§7Lv ${classLevel(player, id)}${id === cur ? " §aSELECTED" : ""}`,
        icon: c.icon,
        onClick: () => {
          player.setDynamicProperty("eco:dgclass", id);
          success(player, `Class set to ${c.name}: ${c.desc}.`);
          return again();
        },
      })),
      backTile(back),
    ],
  });
}

export async function dungeonMenu(player, back) {
  const again = () => dungeonMenu(player, back);
  const info = levelFrom(dungeonXp(player));
  const run = runOf(player);
  const reward = rewardState(player);
  const tiles = [];
  if (run) {
    tiles.push({
      text: "§c§lLEAVE DUNGEON",
      sub: "§7Give up this run",
      icon: ICON.cancel,
      onClick: () => leaveRun(player),
    });
  } else tiles.push({ text: "§5§lPLAY", sub: "§7Choose a floor", icon: "textures/items/ender_eye", badge: "HOT", onClick: () => playMenu(player, again) });
  tiles.push(
    { text: "§b§lCLASS", sub: `§7${CLASSES[getClass(player)].name}`, icon: CLASSES[getClass(player)].icon, onClick: () => classMenu(player, again) },
    {
      text: "§6§lREWARDS",
      sub: !reward ? "§7None waiting" : reward.free ? `§aGrade ${reward.r.grade} - free chest!` : `§7${reward.paid} paid chest${reward.paid === 1 ? "" : "s"} left`,
      icon: "textures/blocks/chest_front",
      badge: reward?.free ? "NEW" : undefined,
      onClick: () => rewardsMenu(player, again),
    },
    { text: "§d§lESSENCE SHOP", sub: `§d${getEssence(player)} Essence`, icon: "textures/items/amethyst_shard", onClick: () => essenceShop(player, again) },
    { text: "§6§lSTAR ITEM", sub: "§7Held dungeon item", icon: "textures/items/nether_star", onClick: () => starMenu(player, again) },
    backTile(back)
  );
  await tileMenu(player, {
    title: "DUNGEONS",
    theme: "purple",
    body: [
      `§7Dungeon level: §3${info.level} §8(${Math.floor(info.into)}/${info.need || "MAX"} XP)`,
      `§7Class: §f${CLASSES[getClass(player)].name} §7Lv ${classLevel(player, getClass(player))}    §7Essence: §d${getEssence(player)}`,
      run ? `§aIn ${run.floor.name}: room ${run.cur}/${run.rooms.length - 1}` : "§7Clear rooms, find secrets and beat the boss. Up to 5 players.",
    ].join("\n"),
    tiles,
  });
}

// ---- register ------------------------------------------------------------------
export function registerDungeons() {
  dungeonBonus.essence.push(() => (mayorIs("quill") ? 25 : 0));
  dungeonBonus.xp.push(() => (mayorIs("quill") ? 25 : 0));
  adminRpgTiles.push((player, back) => ({
    text: "§5§lDUNGEON XP",
    sub: "§7XP & Essence",
    icon: "textures/items/ender_eye",
    onClick: async () => {
      const res = await showForm(
        player,
        new ModalFormData()
          .title("Dungeon test tools")
          .textField("Dungeon XP (Lv2 ~ 400, Lv5 ~ 3000, Lv9 ~ 13000, Lv14 ~ 40000)", "0", { defaultValue: String(dungeonXp(player)) })
          .textField("Essence", "0", { defaultValue: String(getEssence(player)) })
      );
      if (res && !res.canceled) {
        player.setDynamicProperty("eco:dgxp", Math.max(0, Number(res.formValues[0]) || 0));
        player.setDynamicProperty("eco:essence", Math.max(0, Number(res.formValues[1]) || 0));
        success(player, `Dungeon level ${dungeonLevel(player)}, ${getEssence(player)} Essence.`);
      }
      return back();
    },
  }));
  // class + dungeon level stats, only inside a dungeon
  statSources.push((player) => {
    if (!inDungeon(player)) return undefined;
    const cls = getClass(player);
    const c = CLASSES[cls];
    const l = classLevel(player, cls);
    const stats = { ...c.stats };
    for (const [k, v] of Object.entries(c.per)) stats[k] = (stats[k] ?? 0) + v * l;
    stats.def = (stats.def ?? 0) + dungeonLevel(player);
    return { label: `${c.name} (dungeon class)`, stats };
  });
  combatHooks.damageBonus.push((player) => (inDungeon(player) ? dungeonLevel(player) : 0));
  combatHooks.playerHurt.push((player) => {
    const run = runOf(player);
    if (!run || run.state !== "active") return;
    const h = player.getComponent("minecraft:health");
    if (h && h.currentValue <= 4) down(player, run);
  });
  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (deadEntity.typeId !== "minecraft:player") return;
    const run = runOf(deadEntity);
    if (run) run.deaths++;
  });
  world.afterEvents.playerSpawn.subscribe(({ player }) => {
    system.runTimeout(() => {
      if (!player.isValid) return;
      const run = runOf(player);
      if (run) {
        try {
          player.teleport(entryOf(run, run.cur), { dimension: dim() });
        } catch {}
      } else if (player.getDynamicProperty("eco:dgReturn")) sendBack(player); // the world restarted mid-run
    }, 10);
  });
  world.beforeEvents.playerLeave.subscribe(({ player }) => {
    const run = runOf(player);
    if (!run) return;
    const id = player.id;
    system.run(() => {
      run.players = run.players.filter((x) => x !== id);
      playerRun.delete(id);
      if (!run.players.length) endRun(run, false);
    });
  });
  // no building in dungeons; secret chests
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (inDungeon(ev.player)) ev.cancel = true;
  });
  world.beforeEvents.playerPlaceBlock?.subscribe((ev) => {
    if (inDungeon(ev.player)) ev.cancel = true;
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const run = runOf(ev.player);
    if (!run || ev.block.typeId !== "minecraft:chest") return;
    ev.cancel = true;
    const b = ev.block.location;
    const room = run.rooms.find((r) => r.secretAt && r.secretAt.x === b.x && r.secretAt.y === b.y && r.secretAt.z === b.z);
    if (!room || room.secretFound) return;
    room.secretFound = true;
    run.secrets++;
    const p = ev.player;
    system.run(() => {
      cmd(`setblock ${b.x} ${b.y} ${b.z} air`);
      addEssence(p, 5 + run.floorIndex * 5);
      party(run, `§d✦ §f${p.name} §dfound a secret! §7(+${5 + run.floorIndex * 5} Essence)`);
      p.playSound("random.levelup", { pitch: 1.8 });
    });
  });
  world.afterEvents.worldLoad.subscribe(() => {
    system.runInterval(() => {
      for (const run of [...runs.values()]) {
        try {
          tickRun(run);
        } catch (e) {
          console.warn("[eco] dungeon: " + e);
        }
      }
    }, 20);
    system.runInterval(clericTick, 100);
  });
  // leftover dungeon mobs from an older run are removed when they load
  world.afterEvents.entityLoad?.subscribe(({ entity }) => {
    try {
      const r = entity.getDynamicProperty("eco:dg");
      if (r && !runs.has(String(r))) entity.remove();
    } catch {}
  });
}


/** Sidebar lines while in a dungeon (or undefined). */
export function dungeonObjective(player) {
  const run = runOf(player);
  if (!run) return undefined;
  const t = run.start ? Math.floor((Date.now() - run.start) / 1000) : 0;
  return [
    `§c${run.floor.name}`,
    ` §7Room: §a${Math.max(0, run.cur)}§7/§a${run.rooms.length - 1}`,
    ` §7Time: §e${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`,
    ` §7Secrets: §d${run.secrets}  §7Downs: §c${run.deaths}`,
    ` §7Class: §f${CLASSES[getClass(player)].name}`,
  ];
}
