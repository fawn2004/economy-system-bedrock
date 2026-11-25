import { ItemStack, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { allClans, clanOf, getClan, onlineMembers, saveClan, tellClan } from "./clans.js";
import { addLedger, bankOf, clanWorth, spend } from "./bank.js";
import { coreLevel, raidImmunityHours } from "./core.js";
import { setRaidEndHook } from "./raids.js";
import { fmt } from "./eco/economy.js";

// ---------------------------------------------------------------------------
// After a raid: immunity, insurance, revenge, raid log, stats and crate keys.
//   clan.immuneUntil, clan.insurance (tiers owned, 0-4), clan.revenge
//   clan.log   [{ t, kind, other, money, detail }]  newest first
//   clan.stats { wins, losses, defences, streak, bestStreak }
// ---------------------------------------------------------------------------

const now = () => Date.now();

function log(clan, kind, other, money, detail) {
  clan.log = [{ t: now(), kind, other, money, detail }, ...(clan.log ?? [])].slice(0, CONFIG.raidLogSize);
}

function stats(clan) {
  clan.stats = { wins: 0, losses: 0, defences: 0, streak: 0, bestStreak: 0, ...(clan.stats ?? {}) };
  return clan.stats;
}

export function giveKey(player, crate, amount = 1) {
  const c = CONFIG.crates[crate];
  if (!c || !player?.isValid) return false;
  try {
    const inv = player.getComponent("minecraft:inventory")?.container;
    const left = inv?.addItem(new ItemStack(c.key, amount));
    if (left) player.dimension.spawnItem(left, player.location);
    player.sendMessage(`${CONFIG.prefix}§aYou got ${amount}x ${c.color}${c.name} Key§a!`);
    return true;
  } catch (e) {
    console.warn(`[cloudbreak] key: ${e}`);
    return false;
  }
}

function onRaidEnd(raid, outcome) {
  const attacker = getClan(raid.attacker);
  const target = getClan(raid.target);
  if (!attacker || !target) return;
  const squad = Object.keys(raid.raiders).length;
  let keysFor = [];
  const typeName = { normal: "Normal raid", intel: "Intel raid", cheap: "Cheap raid", revenge: "Revenge raid" }[raid.type] ?? "Raid";

  if (outcome === "won") {
    const stolen = raid.stolen;
    // insurance pays part of the stolen money back (from the server)
    const tier = target.insurance ?? 0;
    const pct = tier ? CONFIG.insurance[tier - 1].pct : 0;
    const refund = Math.floor(stolen * pct);
    if (refund > 0) {
      target.bank = bankOf(target) + refund;
      addLedger(target, `${CONFIG.insurance[tier - 1].name} insurance payout`, "Insurance", refund);
      tellClan(target, `§aYour ${CONFIG.insurance[tier - 1].name} insurance paid back §f${fmt(refund)}§a.`);
    }
    target.immuneUntil = now() + raidImmunityHours(target) * 3600000;
    target.revenge = { clanId: attacker.id, until: now() + CONFIG.raid.revengeHours * 3600000 };
    stats(attacker).wins += 1;
    const ts = stats(target);
    ts.losses += 1;
    ts.streak = 0;
    log(attacker, "won", target.name, stolen + raid.bonus, `${typeName} · ${squad} raiders${raid.bonus ? ` · +${fmt(raid.bonus)} underdog bonus` : ""}`);
    log(target, "raided", attacker.name, -stolen, `${squad} raiders${refund ? ` · insurance paid ${fmt(refund)}` : ""}`);
    if (refund) target.log[0].refund = refund; // shown on the Raid Log and Insurance Vault
    tellClan(target, `§7You're immune to raids for §f${raidImmunityHours(target)}h§7. Revenge Raid unlocked on §e${attacker.name}§7 for ${CONFIG.raid.revengeHours}h.`);
    keysFor = Object.keys(raid.raiders).map((id) => [id, "raider", attacker]);
  } else if (outcome === "defended") {
    stats(attacker).losses += 1;
    const ts = stats(target);
    ts.defences += 1;
    ts.streak += 1;
    ts.bestStreak = Math.max(ts.bestStreak, ts.streak);
    log(attacker, "failed", target.name, -raid.price, `${typeName} · didn't land in time`);
    log(target, "defended", attacker.name, raid.price, `${squad} raiders held off · fee paid to you`);
    keysFor = onlineMembers(target).map((p) => [p.id, "defender", target]);
  } else if (outcome === "backout") {
    log(attacker, "backout", target.name, -Math.ceil(raid.price * (1 - CONFIG.raid.backOutRefund)), "Called off in time");
  }
  // offline players get their key the next time they join
  for (const [id, crate, clan] of keysFor) {
    const m = clan.members[id];
    if (!world.getEntity(id) && m) m.owedKeys = { ...(m.owedKeys ?? {}), [crate]: (m.owedKeys?.[crate] ?? 0) + 1 };
  }
  saveClan(attacker);
  saveClan(target);
  for (const [id, crate] of keysFor) {
    const p = world.getEntity(id);
    if (p) giveKey(p, crate);
  }
}

/** Gives a player any crate keys they earned while offline. */
export function payOwedKeys(player) {
  const clan = clanOf(player);
  const m = clan?.members[player.id];
  if (!m?.owedKeys) return;
  const owed = m.owedKeys;
  m.owedKeys = undefined;
  saveClan(clan);
  for (const [crate, n] of Object.entries(owed)) giveKey(player, crate, n);
}

// ---------------------------------------------------------------------------
// Insurance
// ---------------------------------------------------------------------------

export function buyInsurance(player) {
  const clan = clanOf(player);
  if (!clan) return { ok: false, msg: "You are not in a clan." };
  const owned = clan.insurance ?? 0;
  if (owned >= CONFIG.insurance.length) return { ok: false, msg: "You already have the best insurance." };
  const tier = CONFIG.insurance[owned];
  const paid = spend(player, tier.price, `Insurance: ${tier.name}`);
  if (!paid.ok) return paid;
  paid.clan.insurance = owned + 1;
  saveClan(paid.clan);
  tellClan(paid.clan, `§e${player.name}§7 bought §b${tier.name}§7 insurance: ${Math.round(tier.pct * 100)}% of stolen money comes back.`);
  return { ok: true, msg: `${tier.name} insurance bought.` };
}

// ---------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------

export const BOARDS = [
  { id: "wins", name: "Raid Wins", value: (c) => c.stats?.wins ?? 0, show: (c) => `${c.stats?.wins ?? 0}W · ${c.stats?.losses ?? 0}L` },
  { id: "streak", name: "Defence Streak", value: (c) => c.stats?.streak ?? 0, show: (c) => `${c.stats?.streak ?? 0} in a row (best ${c.stats?.bestStreak ?? 0})` },
  { id: "richest", name: "Richest", value: (c) => clanWorth(c), show: (c) => fmt(clanWorth(c)) },
  { id: "core", name: "Core Level", value: (c) => coreLevel(c), show: (c) => `Level ${coreLevel(c)}` },
];

export function board(id) {
  const b = BOARDS.find((x) => x.id === id) ?? BOARDS[0];
  return allClans()
    .map((c) => ({ clan: c, v: b.value(c), text: b.show(c) }))
    .sort((x, y) => y.v - x.v);
}

export function registerAfterRaid() {
  setRaidEndHook(onRaidEnd);
}
