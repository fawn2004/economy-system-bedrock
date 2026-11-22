import { world } from "@minecraft/server";
import { CONFIG } from "./config.js";

// Balances are stored on the player (dynamic property eco:bal), which holds
// numbers far beyond the scoreboard's ~2.1 billion limit. The "money"
// scoreboard is kept as a mirror (capped at 2.1B) for the sidebar and for
// /scoreboard commands: any change made to it by a command is picked up and
// applied to the real balance the next time the balance is read.

const SB_MAX = 2147483647;
const BAL = "eco:bal";
const MIRROR = "eco:balMirror";
const WORLD_BAL = "eco:balw:"; // world copy for leaderboards (offline players)

function objective() {
  return (
    world.scoreboard.getObjective(CONFIG.objective) ??
    world.scoreboard.addObjective(CONFIG.objective, CONFIG.objectiveDisplay)
  );
}

export function initEconomy() {
  objective();
}

function readScore(player) {
  try {
    return objective().getScore(player);
  } catch {
    return undefined;
  }
}

function writeMirror(player, value) {
  const m = Math.min(SB_MAX, value);
  try {
    objective().setScore(player, m);
  } catch {}
  player.setDynamicProperty(MIRROR, m);
}

function recordWorld(player, value) {
  try {
    world.setDynamicProperty(WORLD_BAL + player.id, JSON.stringify({ name: player.name, bal: value, sid: player.scoreboardIdentity?.id }));
  } catch {}
}

export function getBalance(player) {
  let bal = player.getDynamicProperty(BAL);
  const score = readScore(player);
  if (typeof bal !== "number") {
    // first time on this version: start from the scoreboard
    bal = score ?? 0;
    player.setDynamicProperty(BAL, bal);
    player.setDynamicProperty(MIRROR, Math.min(SB_MAX, bal));
    return bal;
  }
  const mirror = player.getDynamicProperty(MIRROR);
  if (typeof score === "number" && typeof mirror === "number" && score !== mirror) {
    // someone changed the scoreboard with a command: apply the difference
    // (scores wrap around at 2.1 billion, so undo any wrap-around)
    let delta = score - mirror;
    if (delta < -2147483648) delta += 4294967296;
    if (delta > 2147483647) delta -= 4294967296;
    bal = Math.max(0, Math.min(CONFIG.maxBalance, bal + delta));
    player.setDynamicProperty(BAL, bal);
    writeMirror(player, bal);
    recordWorld(player, bal);
  }
  return bal;
}

export function setBalance(player, amount) {
  const value = Math.max(0, Math.min(CONFIG.maxBalance, Math.floor(amount)));
  player.setDynamicProperty(BAL, value);
  writeMirror(player, value);
  recordWorld(player, value);
  rememberName(player);
  return value;
}

export function addMoney(player, amount) {
  return setBalance(player, getBalance(player) + amount);
}

/** Takes money if the player can afford it. Returns true on success. */
export function takeMoney(player, amount) {
  const bal = getBalance(player);
  if (amount < 0 || bal < amount) return false;
  setBalance(player, bal - amount);
  return true;
}

// Offline players show up on the scoreboard without a readable name, so we
// remember the name of every scoreboard identity we have seen.
export function rememberName(player) {
  const id = player.scoreboardIdentity?.id;
  if (id !== undefined) world.setDynamicProperty(`eco:name:${id}`, player.name);
}

/** Everyone's balance: real balances where known, scoreboard for players not seen since this update. */
function allBalances() {
  for (const p of world.getAllPlayers()) recordWorld(p, getBalance(p));
  const out = [];
  const seenScore = new Set();
  for (const k of world.getDynamicPropertyIds()) {
    if (!k.startsWith(WORLD_BAL)) continue;
    try {
      const v = JSON.parse(String(world.getDynamicProperty(k)));
      out.push({ id: k.slice(WORLD_BAL.length), name: v.name, score: Number(v.bal) || 0 });
      if (v.sid !== undefined) seenScore.add(v.sid);
    } catch {}
  }
  for (const s of objective().getScores()) {
    if (seenScore.has(s.participant.id)) continue;
    const saved = world.getDynamicProperty(`eco:name:${s.participant.id}`);
    let name = typeof saved === "string" ? saved : s.participant.displayName;
    if (!name || name.startsWith("commands.")) name = "Unknown";
    out.push({ id: null, name, score: s.score });
  }
  return out.filter((e) => e.score > 0).sort((a, b) => b.score - a.score);
}

export function topBalances(limit = 10) {
  return allBalances().slice(0, limit);
}

export function rankOf(player) {
  const i = allBalances().findIndex((e) => e.id === player.id);
  return i < 0 ? undefined : i + 1;
}

/** Keeps balances in step with /scoreboard commands and the sidebar. */
export function syncBalances() {
  for (const p of world.getAllPlayers()) {
    try {
      getBalance(p);
    } catch {}
  }
}

export function fmt(n) {
  const s = String(Math.floor(Math.abs(n)));
  const withCommas = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (n < 0 ? "-" : "") + CONFIG.currency + withCommas;
}

/** Balances: exact below $1M, short above ($2.4M, $15.3B, $7.2T). */
export function fmtMoney(n) {
  return n >= 1e6 ? fmtShort(n) : fmt(n);
}

/** Short form for tiles: $1.2k, $15k, $2.5M */
export function fmtShort(n) {
  const c = CONFIG.currency;
  if (n >= 1e12) return c + trim(n / 1e12) + "T";
  if (n >= 1e9) return c + trim(n / 1e9) + "B";
  if (n >= 1e6) return c + trim(n / 1e6) + "M";
  if (n >= 1e4) return c + trim(n / 1e3) + "k";
  return fmt(n);
}

function trim(x) {
  return x >= 100 ? String(Math.floor(x)) : String(Math.floor(x * 10) / 10);
}
