import { world } from "@minecraft/server";
import { addMoney, fmt } from "./economy.js";

// ============================================================================
//  OFFLINE PAYOUTS
//  Balances live on the player, so money for someone who's offline (their
//  auction sold, they were outbid...) is parked in the world and paid out the
//  next time they join.
// ============================================================================

const KEY = "eco:pend:";

/** Gives `amount` to the player with this id now if they're online, otherwise when they next join. */
export function creditPlayer(playerId, amount, reason) {
  amount = Math.floor(amount);
  if (amount <= 0) return;
  const online = world.getAllPlayers().find((p) => p.id === playerId);
  if (online) {
    addMoney(online, amount);
    if (reason) online.sendMessage(`§6§l$ §r§e${reason} §a+${fmt(amount)}`);
    return;
  }
  let cur = { coins: 0, notes: [] };
  try {
    const raw = world.getDynamicProperty(KEY + playerId);
    if (typeof raw === "string") cur = JSON.parse(raw);
  } catch {}
  cur.coins = (cur.coins ?? 0) + amount;
  if (reason) cur.notes = [...(cur.notes ?? []), `${reason} +${fmt(amount)}`].slice(-8);
  world.setDynamicProperty(KEY + playerId, JSON.stringify(cur));
}

/** Pays out anything that was waiting for this player. */
export function claimPayouts(player) {
  const raw = world.getDynamicProperty(KEY + player.id);
  if (typeof raw !== "string") return;
  world.setDynamicProperty(KEY + player.id, undefined);
  try {
    const cur = JSON.parse(raw);
    if (cur.coins > 0) addMoney(player, cur.coins);
    player.sendMessage(`§6§lWhile you were away:`);
    for (const n of cur.notes ?? []) player.sendMessage(`§7- §e${n}`);
    if (cur.coins > 0) player.sendMessage(`§7Total: §a+${fmt(cur.coins)}`);
  } catch {}
}
