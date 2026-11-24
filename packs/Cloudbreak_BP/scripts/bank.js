import { CONFIG } from "./config.js";
import { canManage, clanOf, saveClan, tellClan } from "./clans.js";
import { addMoney, fmt, getBalance, takeMoney } from "./eco/economy.js";

// Clan bank: clan.bank (money) and clan.ledger (newest first).
// ledger entry = { t: timestamp, what, who, amt }   amt > 0 = money in

export const bankOf = (clan) => clan?.bank ?? 0;

export function addLedger(clan, what, who, amt) {
  clan.ledger = [{ t: Date.now(), what, who, amt }, ...(clan.ledger ?? [])].slice(0, CONFIG.core.ledgerSize);
}

/** Adds (or with a negative amount removes) money from a clan bank without a player. */
export function bankChange(clan, amt, what, who = "Island core") {
  clan.bank = Math.max(0, bankOf(clan) + amt);
  addLedger(clan, what, who, amt);
  saveClan(clan);
}

const fail = (msg) => ({ ok: false, msg });

export function deposit(player, rawAmount) {
  const clan = clanOf(player);
  if (!clan) return fail("You are not in a clan.");
  const amount = Math.floor(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) return fail("Enter an amount above $0.");
  if (!takeMoney(player, amount)) return fail(`You only have ${fmt(getBalance(player))}.`);
  clan.bank = bankOf(clan) + amount;
  addLedger(clan, "Deposit", player.name, amount);
  saveClan(clan);
  tellClan(clan, `§e${player.name}§7 deposited §a${fmt(amount)}§7. Bank: §a${fmt(clan.bank)}`);
  return { ok: true, msg: `Deposited ${fmt(amount)}.`, clan };
}

export function withdraw(player, rawAmount) {
  const clan = clanOf(player);
  if (!clan) return fail("You are not in a clan.");
  if (!canManage(clan, player.id)) return fail("Only the Owner and Co-Owners can withdraw.");
  const amount = Math.floor(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) return fail("Enter an amount above $0.");
  if (amount > bankOf(clan)) return fail(`The clan bank only has ${fmt(bankOf(clan))}.`);
  clan.bank = bankOf(clan) - amount;
  addMoney(player, amount);
  addLedger(clan, "Withdraw", player.name, -amount);
  saveClan(clan);
  tellClan(clan, `§e${player.name}§7 withdrew §c${fmt(amount)}§7. Bank: §a${fmt(clan.bank)}`);
  return { ok: true, msg: `Withdrew ${fmt(amount)}.`, clan };
}

/** Spends from the clan bank for something the clan buys (upgrades, raids, insurance).
 *  worth = true when the money stays in the clan as value (core upgrades). */
export function spend(player, amount, what, worth = false) {
  const clan = clanOf(player);
  if (!clan) return fail("You are not in a clan.");
  if (amount > bankOf(clan)) return fail(`The clan bank needs ${fmt(amount)} (it has ${fmt(bankOf(clan))}).`);
  clan.bank = bankOf(clan) - amount;
  if (worth) clan.spent = (clan.spent ?? 0) + amount; // counts toward clan worth
  addLedger(clan, what, player.name, -amount);
  saveClan(clan);
  return { ok: true, clan };
}

/** Clan worth for the underdog bonus: bank + everything spent on the core. */
export const clanWorth = (clan) => bankOf(clan) + (clan.spent ?? 0);
