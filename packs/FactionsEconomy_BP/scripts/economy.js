import { world } from "@minecraft/server";
import { CONFIG } from "./config.js";

// Balances live on a scoreboard so they survive restarts, work on Realms and
// can be edited with normal /scoreboard commands.

function objective() {
  return (
    world.scoreboard.getObjective(CONFIG.objective) ??
    world.scoreboard.addObjective(CONFIG.objective, CONFIG.objectiveDisplay)
  );
}

export function initEconomy() {
  objective();
}

export function getBalance(player) {
  try {
    return objective().getScore(player) ?? 0;
  } catch {
    return 0;
  }
}

export function setBalance(player, amount) {
  const value = Math.max(0, Math.min(CONFIG.maxBalance, Math.floor(amount)));
  objective().setScore(player, value);
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

export function topBalances(limit = 10) {
  return objective()
    .getScores()
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => {
      const saved = world.getDynamicProperty(`eco:name:${s.participant.id}`);
      let name = typeof saved === "string" ? saved : s.participant.displayName;
      if (!name || name.startsWith("commands.")) name = "Unknown";
      return { name, score: s.score };
    });
}

export function rankOf(player) {
  const id = player.scoreboardIdentity?.id;
  if (id === undefined) return undefined;
  const sorted = objective()
    .getScores()
    .sort((a, b) => b.score - a.score);
  const i = sorted.findIndex((s) => s.participant.id === id);
  return i < 0 ? undefined : i + 1;
}

export function fmt(n) {
  const s = String(Math.floor(Math.abs(n)));
  const withCommas = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (n < 0 ? "-" : "") + CONFIG.currency + withCommas;
}

/** Short form for tiles: $1.2k, $15k, $2.5M */
export function fmtShort(n) {
  const c = CONFIG.currency;
  if (n >= 1e6) return c + trim(n / 1e6) + "M";
  if (n >= 1e4) return c + trim(n / 1e3) + "k";
  return fmt(n);
}

function trim(x) {
  return x >= 100 ? String(Math.floor(x)) : String(Math.floor(x * 10) / 10);
}
