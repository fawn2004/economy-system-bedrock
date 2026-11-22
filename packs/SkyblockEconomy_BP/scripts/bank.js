import { system, world } from "@minecraft/server";
import { BANK } from "./config.js";
import { addMoney, fmt, fmtMoney, fmtShort, getBalance, takeMoney } from "./economy.js";
import { ICON, askAmount, backTile, fail, success, tileMenu } from "./ui.js";

// ============================================================================
//  BANK
//  Money in the bank is separate from the purse (the normal balance). It pays
//  interest every few real hours, up to the account tier's limit. Upgrading
//  the account raises how much it holds and the biggest interest payout.
//  Data on the player: eco:bank (coins), eco:bankTier, eco:bankNext (ms), eco:bankLog
// ============================================================================

const HOUR = 3600 * 1000;

export const getBank = (player) => Number(player.getDynamicProperty("eco:bank") ?? 0);
const setBank = (player, n) => player.setDynamicProperty("eco:bank", Math.max(0, Math.floor(n)));
const tierIndex = (player) => Math.min(BANK.tiers.length - 1, Math.max(0, Number(player.getDynamicProperty("eco:bankTier") ?? 0)));
export const bankTier = (player) => BANK.tiers[tierIndex(player)];

function log(player, line) {
  let list = [];
  try {
    list = JSON.parse(String(player.getDynamicProperty("eco:bankLog") ?? "[]"));
  } catch {}
  const d = new Date();
  const stamp = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  list.unshift(`§8${stamp} §r${line}`);
  player.setDynamicProperty("eco:bankLog", JSON.stringify(list.slice(0, 10)));
}

const nextInterestAt = (player) => {
  let next = Number(player.getDynamicProperty("eco:bankNext") ?? 0);
  if (!next) {
    next = Date.now() + BANK.intervalHours * HOUR;
    player.setDynamicProperty("eco:bankNext", next);
  }
  return next;
};

function interestFor(player) {
  return Math.min(bankTier(player).maxInterest, Math.floor((getBank(player) * BANK.rate) / 100));
}

/** Pays any interest that's due (catching up missed payouts). */
export function payInterest(player) {
  const now = Date.now();
  let next = nextInterestAt(player);
  if (now < next) return;
  const period = BANK.intervalHours * HOUR;
  let payouts = 0;
  let total = 0;
  while (now >= next) {
    if (payouts < BANK.maxCatchUp) {
      const room = bankTier(player).limit - getBank(player);
      const gain = Math.max(0, Math.min(room, interestFor(player)));
      if (gain > 0) {
        setBank(player, getBank(player) + gain);
        total += gain;
      }
      payouts++;
    }
    next += period;
  }
  player.setDynamicProperty("eco:bankNext", next);
  if (total > 0) {
    log(player, `§a+${fmt(total)} §7interest`);
    player.sendMessage(`§6§lBANK §r§7You earned §a${fmt(total)} §7interest! §8(bank: ${fmtMoney(getBank(player))})`);
    player.playSound("random.orb");
  }
}

function timeLeft(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

function deposit(player, amount) {
  const t = bankTier(player);
  const room = t.limit - getBank(player);
  amount = Math.min(amount, room, getBalance(player));
  if (room <= 0) return fail(player, `Your ${t.name} account is full (${fmtShort(t.limit)}). Upgrade it to hold more.`);
  if (amount <= 0) return fail(player, "You have no money in your purse.");
  if (!takeMoney(player, amount)) return fail(player, "You don't have that much money.");
  setBank(player, getBank(player) + amount);
  log(player, `§a+${fmt(amount)} §7deposit`);
  success(player, `Deposited ${fmt(amount)}.`);
}

function withdraw(player, amount) {
  amount = Math.min(amount, getBank(player));
  if (amount <= 0) return fail(player, "Your bank is empty.");
  setBank(player, getBank(player) - amount);
  addMoney(player, amount);
  log(player, `§c-${fmt(amount)} §7withdrawal`);
  success(player, `Withdrew ${fmt(amount)}.`);
}

export async function bankMenu(player, back) {
  payInterest(player);
  const t = bankTier(player);
  const bank = getBank(player);
  const purse = getBalance(player);
  const again = () => bankMenu(player, back);
  const nextTier = BANK.tiers[tierIndex(player) + 1];
  const body = [
    `§7Account: §6${t.name} §8(holds up to ${fmtShort(t.limit)})`,
    `§7Bank: §6§l${fmtMoney(bank)}§r    §7Purse: §a${fmtMoney(purse)}`,
    `§7Interest: §b${BANK.rate}% §7every §b${BANK.intervalHours}h §8(max ${fmtShort(t.maxInterest)})`,
    `§7Next payout: §e${fmt(interestFor(player))} §7in §e${timeLeft(nextInterestAt(player) - Date.now())}`,
  ].join("\n");
  const ask = async (title, label, fn) => {
    const n = await askAmount(player, title, label);
    if (n !== undefined) fn(n);
    return again();
  };
  const tiles = [
    { text: "§a§lDEPOSIT ALL", sub: `§a${fmtShort(purse)}`, icon: ICON.bank, onClick: () => (deposit(player, purse), again()) },
    { text: "§a§lDEPOSIT HALF", sub: `§a${fmtShort(Math.floor(purse / 2))}`, icon: ICON.bank, onClick: () => (deposit(player, Math.floor(purse / 2)), again()) },
    { text: "§a§lDEPOSIT...", sub: "§7Type amount", icon: ICON.pay, onClick: () => ask("Deposit", `Amount (purse: ${fmt(purse)})`, (n) => deposit(player, n)) },
    { text: "§c§lWITHDRAW ALL", sub: `§6${fmtShort(bank)}`, icon: ICON.coin, onClick: () => (withdraw(player, bank), again()) },
    { text: "§c§lWITHDRAW HALF", sub: `§6${fmtShort(Math.floor(bank / 2))}`, icon: ICON.coin, onClick: () => (withdraw(player, Math.floor(bank / 2)), again()) },
    { text: "§c§lWITHDRAW...", sub: "§7Type amount", icon: ICON.pay, onClick: () => ask("Withdraw", `Amount (bank: ${fmt(bank)})`, (n) => withdraw(player, n)) },
    {
      text: "§e§lHISTORY",
      sub: "§7Last 10",
      icon: "textures/items/book_writable",
      onClick: async () => {
        let list = [];
        try {
          list = JSON.parse(String(player.getDynamicProperty("eco:bankLog") ?? "[]"));
        } catch {}
        await tileMenu(player, { title: "BANK HISTORY", theme: "gold", body: list.length ? list.join("\n") : "§7Nothing yet.", tiles: [backTile(again)] });
      },
    },
  ];
  if (nextTier) {
    tiles.push({
      text: `§6§lUPGRADE`,
      sub: `§7${nextTier.name} ${getBalance(player) >= nextTier.cost ? "§a" : "§c"}${fmtShort(nextTier.cost)}`,
      icon: "textures/items/gold_ingot",
      badge: "NEW",
      onClick: async () => {
        const ok = await tileMenu(player, {
          title: "UPGRADE ACCOUNT",
          theme: "gold",
          body: `§7Upgrade to §6${nextTier.name}§7 for §a${fmt(nextTier.cost)}§7 (from your purse)?\n§7Holds: §f${fmtShort(t.limit)} §7> §a${fmtShort(nextTier.limit)}\n§7Max interest: §f${fmtShort(t.maxInterest)} §7> §a${fmtShort(nextTier.maxInterest)}`,
          tiles: [
            { text: "§a§lCONFIRM", sub: `§a${fmtShort(nextTier.cost)}`, icon: ICON.confirm, id: "yes" },
            { text: "§c§lCANCEL", sub: "§7Go back", icon: ICON.cancel },
          ],
        });
        if (ok?.id === "yes") {
          if (!takeMoney(player, nextTier.cost)) fail(player, "You can't afford that upgrade.");
          else {
            player.setDynamicProperty("eco:bankTier", tierIndex(player) + 1);
            log(player, `§6Upgraded to ${nextTier.name}`);
            success(player, `Your bank account is now ${nextTier.name}!`);
          }
        }
        return again();
      },
    });
  }
  tiles.push(backTile(back));
  await tileMenu(player, { title: "BANK", theme: "gold", body, tiles });
}

export function registerBank() {
  world.afterEvents.worldLoad.subscribe(() => {
    system.runInterval(() => {
      for (const p of world.getAllPlayers()) {
        try {
          payInterest(p);
        } catch {}
      }
    }, 1200); // check once a minute
  });
}
