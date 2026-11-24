import { system, world } from "@minecraft/server";
import { SKILLS } from "./config.js";
import { fmt, fmtMoney, getBalance, rankOf, topBalances } from "./economy.js";
import { getSkillXp, levelInfo, skillIds } from "./skills.js";
import { collectionTotal } from "./tools.js";
import { backTile, tileMenu } from "./ui.js";

// ============================================================================
//  LEADERBOARDS
//  Player stats live on the player, which scripts can only read while they're
//  online - so every minute (and when they leave) a snapshot is saved in the
//  world:  eco:lb:<playerId> = { name, stats }.  Boards read those snapshots,
//  so offline players stay ranked.
// ============================================================================

const SNAP = "eco:lb:";
const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Lifetime heads collected (counted when heads are sold / added). */
export function addHeadsCollected(player, n) {
  if (n > 0) player.setDynamicProperty("eco:stat:heads", Number(player.getDynamicProperty("eco:stat:heads") ?? 0) + n);
}

function statsOf(player) {
  const stats = {
    heads: Number(player.getDynamicProperty("eco:stat:heads") ?? 0),
    farming: collectionTotal(player, "farming"),
    combat: collectionTotal(player, "slayer"),
  };
  let sum = 0, n = 0;
  for (const id of skillIds()) {
    if (SKILLS[id]?.disabled) continue;
    const xp = getSkillXp(player, id);
    stats[`skill_${id}`] = xp;
    sum += levelInfo(xp).level;
    n++;
  }
  stats.skillAvg = n ? Math.round((sum / n) * 10) / 10 : 0;
  return stats;
}

export function snapshot(player) {
  try {
    world.setDynamicProperty(SNAP + player.id, JSON.stringify({ name: player.name, stats: statsOf(player) }));
  } catch {}
}

function allSnapshots() {
  // online players are always fresh
  for (const p of world.getAllPlayers()) snapshot(p);
  const out = [];
  for (const k of world.getDynamicPropertyIds()) {
    if (!k.startsWith(SNAP)) continue;
    try {
      const v = JSON.parse(String(world.getDynamicProperty(k)));
      out.push({ id: k.slice(SNAP.length), name: v.name, stats: v.stats ?? {} });
    } catch {}
  }
  return out;
}

/** Spawners (counting stacks) / minions owned, from the world registries. */
function ownedCounts(prefix, field) {
  const counts = new Map();
  for (const k of world.getDynamicPropertyIds()) {
    if (!k.startsWith(prefix)) continue;
    try {
      const v = JSON.parse(String(world.getDynamicProperty(k)));
      if (!v.owner) continue;
      counts.set(v.owner, (counts.get(v.owner) ?? 0) + (field ? Number(v[field] ?? 1) : 1));
    } catch {}
  }
  return counts;
}

// ---- boards -------------------------------------------------------------------
function boards() {
  const list = [
    { id: "balance", name: "Balance", icon: "textures/ui/eco/icon_bank", theme: "gold", unit: "" },
    { id: "heads", name: "Heads Collected", icon: "textures/items/eco_heads/zombie", theme: "purple", unit: " heads", stat: "heads" },
    { id: "farming", name: "Farming", icon: "textures/ui/eco/icon_farming", theme: "green", unit: " crops", stat: "farming" },
    { id: "combat", name: "Combat", icon: "textures/items/iron_sword", theme: "red", unit: " kills", stat: "combat" },
    { id: "skillAvg", name: "Skill Average", icon: "textures/ui/eco/icon_top", theme: "blue", unit: "", stat: "skillAvg", decimals: true },
  ];
  for (const id of skillIds()) {
    const s = SKILLS[id];
    if (s.disabled) continue;
    list.push({ id: `skill_${id}`, name: `${s.name} Skill`, icon: s.icon, theme: "blue", stat: `skill_${id}`, skill: true });
  }
  list.push({ id: "spawners", name: "Spawners", icon: "textures/ui/eco/icon_spawners", theme: "red", unit: " spawners", owned: ["eco:sp:", "stack"] });
  list.push({ id: "minions", name: "Minions", icon: "textures/ui/eco/icon_minion", theme: "orange", unit: " minions", owned: ["eco:mi:", null] });
  return list;
}

/** -> [{ id, name, value }] best first */
function ranking(board) {
  if (board.id === "balance") return topBalances(1000).map((e) => ({ id: null, name: e.name, value: e.score }));
  const snaps = allSnapshots();
  if (board.owned) {
    const counts = ownedCounts(...board.owned);
    const names = new Map(snaps.map((s) => [s.id, s.name]));
    return [...counts].map(([id, value]) => ({ id, name: names.get(id) ?? "Unknown", value })).sort((a, b) => b.value - a.value);
  }
  return snaps
    .map((s) => ({ id: s.id, name: s.name, value: Number(s.stats[board.stat] ?? 0) }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
}

function show(board, v) {
  if (board.id === "balance") return fmtMoney(v);
  if (board.skill) return `Lv ${levelInfo(v).level} §8(${commas(v)} xp)`;
  if (board.decimals) return String(v);
  const unit = board.unit ?? "";
  return commas(v) + (v === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit);
}

export async function leaderboardsMenu(player, back) {
  const reopen = () => leaderboardsMenu(player, back);
  const tiles = boards().map((b) => ({
    text: `§e§l${b.name.toUpperCase()}`,
    sub: "§7Top 10",
    icon: b.icon,
    onClick: () => boardMenu(player, b, reopen),
  }));
  tiles.push(backTile(back));
  await tileMenu(player, {
    title: "LEADERBOARDS",
    theme: "gold",
    body: "§7See who's on top. §8(Offline players are included - stats save every minute.)",
    tiles,
  });
}

function boardMenu(player, board, back) {
  const list = ranking(board);
  const medal = ["§6", "§f", "§c"];
  const lines = list.slice(0, 10).map((e, i) => `${medal[i] ?? "§7"}#${i + 1} §f${e.name} §7- §a${show(board, e.value)}`);
  let mine;
  if (board.id === "balance") {
    const r = rankOf(player);
    mine = r ? `§7You: §6#${r} §7- §a${fmtMoney(getBalance(player))}` : "§7You're not ranked yet.";
  } else {
    const i = list.findIndex((e) => e.id === player.id);
    mine = i >= 0 ? `§7You: §6#${i + 1} §7- §a${show(board, list[i].value)}` : "§7You're not ranked yet.";
  }
  return tileMenu(player, {
    title: board.name.toUpperCase(),
    theme: board.theme,
    body: (lines.length ? lines.join("\n") : "§7Nobody is on this board yet!") + "\n" + mine,
    tiles: [backTile(back)],
  });
}

/** -> { rank, total } of a player on a board ("skillAvg", "farming", "skill_mining", ...) */
export function rankOn(player, boardId) {
  const board = boards().find((b) => b.id === boardId);
  if (!board) return { rank: undefined, total: 0 };
  const list = ranking(board);
  const i = list.findIndex((e) => e.id === player.id);
  return { rank: i >= 0 ? i + 1 : undefined, total: list.length };
}

export function registerLeaderboards() {
  world.afterEvents.worldLoad.subscribe(() => {
    system.runInterval(() => {
      for (const p of world.getAllPlayers()) snapshot(p);
    }, 1200);
  });
  world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (initialSpawn) system.runTimeout(() => player.isValid && snapshot(player), 40);
  });
  world.beforeEvents.playerLeave.subscribe(({ player }) => {
    const p = player;
    const data = JSON.stringify({ name: p.name, stats: statsOf(p) });
    const key = SNAP + p.id;
    system.run(() => {
      try {
        world.setDynamicProperty(key, data);
      } catch {}
    });
  });
}
