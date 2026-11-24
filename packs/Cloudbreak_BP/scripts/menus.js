import { system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG, ROLE, ROLE_NAME } from "./config.js";
import {
  acceptInvite,
  canManage,
  clanOf,
  createClan,
  declineInvite,
  demoteMember,
  disbandClan,
  invitePlayer,
  kickMember,
  leaveClan,
  memberCount,
  pendingInvite,
  promoteMember,
  roleOf,
  transferLeadership,
} from "./clans.js";
import { clearIslandSpawn, createIsland, sendHome } from "./islands.js";
import { bankOf, deposit, withdraw } from "./bank.js";
import {
  buyUpgrade,
  coreLevel,
  hoursCovered,
  levelOf,
  minutesToTax,
  shieldUp,
  upgradeCost,
} from "./core.js";
import { UPGRADES } from "./config.js";
import { fmt, fmtMoney, getBalance } from "./eco/economy.js";
import { adminMenu, sellMenu, shopMenu } from "./eco/menus.js";
import { playerSettingsMenu } from "./eco/playerSettings.js";

// Floors that later milestones fill in (raids, insurance, raid log, leaderboards).
const floorHooks = {};
export const setFloor = (id, fn) => (floorHooks[id] = fn);

// Milestone 1 uses plain Bedrock forms. Milestone 6 swaps in the chosen
// custom layouts (Elevator Tower, Chain of Command, ...) from the resource pack.

/** form.show() that waits while the player is busy (e.g. chat still open). */
async function show(player, form) {
  for (let tries = 0; tries < 40; tries++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (res.cancelationReason !== FormCancelationReason.UserBusy) return res;
    await system.waitTicks(5);
  }
  return undefined;
}

function report(player, result) {
  player.sendMessage(CONFIG.prefix + (result.ok ? "" : "§c") + result.msg);
}

async function confirm(player, title, body, yes = "Yes") {
  const res = await show(player, new MessageFormData().title(title).body(body).button1(yes).button2("Cancel"));
  return res?.selection === 0;
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

export async function mainMenu(player) {
  const clan = clanOf(player);
  return clan ? clanMenu(player, clan) : noClanMenu(player);
}

async function noClanMenu(player) {
  const inv = pendingInvite(player);
  const buttons = [];
  if (inv) buttons.push({ text: `§2Accept invite\n§r§8${inv.clan.name} · from ${inv.fromName}`, run: () => acceptAndGoHome(player) });
  buttons.push({ text: "Create a Clan\n§r§8Get your own island", run: () => createMenu(player) });
  if (inv) buttons.push({ text: "Decline invite", run: () => report(player, declineInvite(player)) });
  const form = new ActionFormData()
    .title(CONFIG.serverName)
    .body("§7You are not in a clan yet.\n\nCreate one to get an island, or ask a clan to invite you.");
  for (const b of buttons) form.button(b.text);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  await buttons[res.selection]?.run();
}

async function acceptAndGoHome(player) {
  const r = acceptInvite(player);
  report(player, r);
  if (r.ok) await sendHome(player, r.clan);
}

async function createMenu(player) {
  const c = CONFIG.clan;
  const res = await show(
    player,
    new ModalFormData()
      .title("Create a Clan")
      .textField(`Clan name (${c.nameMin}-${c.nameMax} letters, numbers or _)`, "e.g. Nightfall")
  );
  if (!res || res.canceled) return;
  const r = createClan(player, String(res.formValues?.[0] ?? ""));
  report(player, r);
  if (r.ok) await createIsland(player, r.clan);
}

// The Elevator Tower: one floor per screen, top floor first.
async function clanMenu(player, clan) {
  const role = roleOf(clan, player.id);
  const online = Object.keys(clan.members).filter((id) => world.getEntity(id)).length;
  const floors = [
    { n: 9, text: "Settings", sub: "Chunk borders, full bright, raid sound, coords", run: () => playerSettingsMenu(player, () => mainMenu(player)) },
    { n: 8, text: "Leaderboards", sub: "Raid wins, streaks, richest, core level", run: () => floorHooks.leaderboards?.(player) },
    { n: 7, text: "Raid Log", sub: "Raids you did and raids on you", run: () => floorHooks.raidlog?.(player) },
    { n: 6, text: "Members", sub: `${online} / ${memberCount(clan)} online`, run: () => membersMenu(player) },
    { n: 5, text: "Insurance", sub: "Get stolen money back", run: () => floorHooks.insurance?.(player) },
    { n: 4, text: "Sky Shop", sub: "Buy and sell", run: () => floorHooks.shop ? floorHooks.shop(player) : shopMenu(player) },
    { n: 3, text: "Clan Bank", sub: `${fmtMoney(bankOf(clan))} · ${hoursCovered(clan)}h of tax`, run: () => bankMenu(player) },
    { n: 2, text: "Raids", sub: "Buy a raid", run: () => floorHooks.raids?.(player) },
    { n: 1, text: "Island Home", sub: "Teleport to your island", run: () => sendHome(player, clan) },
  ];
  const buttons = floors.map((f) => ({ text: `F${f.n} ${f.text}\n§r§8${f.sub}`, run: f.run }));
  if (player.hasTag("admin")) buttons.push({ text: "§4Admin\n§r§8Server tools", run: () => (floorHooks.admin ? floorHooks.admin(player) : adminMenu(player)) });
  const form = new ActionFormData()
    .title(`${CONFIG.serverName} · ${clan.name}`)
    .body(
      `§7Clan §b${clan.name}§7 · ${ROLE_NAME[role]} · ${memberCount(clan)}/${CONFIG.clan.maxMembers} players\n` +
        `§7Bank §a${fmtMoney(bankOf(clan))}§7 · Shield ${shieldUp(clan) ? "§aONLINE" : "§cDOWN"}`
    );
  for (const b of buttons) form.button(b.text);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  await buttons[res.selection]?.run();
}

// ---------------------------------------------------------------------------
// Clan Bank (Coin Tower)
// ---------------------------------------------------------------------------

export async function bankMenu(player, msg) {
  const clan = clanOf(player);
  if (!clan) return mainMenu(player);
  const manage = canManage(clan, player.id);
  const ledger = (clan.ledger ?? []).slice(0, 8).map((l) => `§8- §7${l.what} §8(${l.who})§r ${l.amt >= 0 ? "§a+" : "§c-"}${fmt(Math.abs(l.amt))}`);
  const form = new ActionFormData()
    .title("Clan Bank")
    .body(
      (msg ? msg + "\n\n" : "") +
        `§7Balance §a${fmt(bankOf(clan))}\n§7Core tax §f${fmt(CONFIG.core.taxPerHour)}/hour§7 · next in §f${minutesToTax(clan)} min§7 online\n` +
        `§7Covers §f${hoursCovered(clan)} hours§7 · your wallet §a${fmt(getBalance(player))}\n\n§fLedger\n` +
        (ledger.length ? ledger.join("\n") : "§8No transactions yet.")
    );
  const buttons = [{ text: "Deposit", run: () => amountMenu(player, "Deposit", deposit) }];
  if (manage) buttons.push({ text: "Withdraw", run: () => amountMenu(player, "Withdraw", withdraw) });
  buttons.push({ text: "Back", run: () => mainMenu(player) });
  for (const b of buttons) form.button(b.text);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  await buttons[res.selection]?.run();
}

const QUICK = [1000, 10000, 100000, 1000000];

async function amountMenu(player, label, action) {
  const form = new ActionFormData().title(label).body(`§7Your wallet §a${fmt(getBalance(player))}§7 · clan bank §a${fmt(bankOf(clanOf(player)))}`);
  const picks = QUICK.map((v) => ({ text: fmtMoney(v), v }));
  picks.push({ text: "All", v: "all" }, { text: "Other amount...", v: "custom" }, { text: "Back", v: "back" });
  for (const p of picks) form.button(p.text);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  let v = picks[res.selection]?.v;
  if (v === "back") return bankMenu(player);
  if (v === "all") v = label === "Deposit" ? getBalance(player) : bankOf(clanOf(player));
  if (v === "custom") {
    const m = await show(player, new ModalFormData().title(label).textField("Amount", "e.g. 25000"));
    if (!m || m.canceled) return bankMenu(player);
    v = Number(String(m.formValues?.[0] ?? "").replace(/[$,\s]/g, ""));
  }
  const r = action(player, v);
  if (r.ok && label === "Deposit") floorHooks.afterDeposit?.(r.clan);
  return bankMenu(player, (r.ok ? "§a" : "§c") + r.msg);
}

// ---------------------------------------------------------------------------
// Core Terminal (opened by tapping the Island Core)
// ---------------------------------------------------------------------------

export async function coreTerminal(player, msg) {
  const clan = clanOf(player);
  if (!clan) return;
  const up = shieldUp(clan);
  const form = new ActionFormData()
    .title(`Core Terminal · ${clan.name}`)
    .body(
      (msg ? msg + "\n\n" : "") +
        `§7Core level §f${coreLevel(clan)}§7 · shield ${up ? "§aONLINE" : "§cDOWN - upgrades are off"}\n` +
        `§7Core tax §f${fmt(CONFIG.core.taxPerHour)}/hour§7 · bank §a${fmt(bankOf(clan))}§7 · covers §f${hoursCovered(clan)}h\n` +
        `§8Upgrades are paid from the clan bank.`
    );
  for (const u of UPGRADES) {
    const lvl = levelOf(clan, u.id);
    const maxed = lvl >= u.max;
    const off = !up && u.id !== "size" && lvl > 0 ? " §c(off)" : "";
    form.button(`${u.name} §8Lv ${lvl}/${u.max}${off}\n§r§8${maxed ? u.desc(lvl) + " · MAX" : `${fmtMoney(upgradeCost(u, lvl + 1))}: ${u.desc(lvl + 1)}`}`);
  }
  form.button("Deposit to Bank");
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled) return;
  if (res.selection < UPGRADES.length) {
    const u = UPGRADES[res.selection];
    const lvl = levelOf(clan, u.id);
    if (lvl >= u.max) return coreTerminal(player, `§7${u.name} is maxed.`);
    const cost = upgradeCost(u, lvl + 1);
    if (!(await confirm(player, u.name, `Upgrade ${u.name} to level ${lvl + 1} for ${fmt(cost)} from the clan bank?\n\n${u.desc(lvl + 1)}`, "Upgrade")))
      return coreTerminal(player);
    const r = buyUpgrade(player, u.id);
    return coreTerminal(player, (r.ok ? "§a" : "§c") + r.msg);
  }
  if (res.selection === UPGRADES.length) return amountMenu(player, "Deposit", deposit);
}

// ---------------------------------------------------------------------------
// Members (Chain of Command)
// ---------------------------------------------------------------------------

const ROLE_ORDER = { owner: 0, coowner: 1, member: 2 };

async function membersMenu(player) {
  const clan = clanOf(player);
  if (!clan) return;
  const list = Object.entries(clan.members).sort(
    (a, b) => ROLE_ORDER[a[1].role] - ROLE_ORDER[b[1].role] || a[1].joined - b[1].joined
  );
  const form = new ActionFormData().title(`Members · ${clan.name}`).body("§7Pick a player to see what you can do.");
  for (const [id, m] of list) {
    const on = world.getEntity(id) ? "§2online" : "§8offline";
    form.button(`${m.name}${id === player.id ? " §8(you)" : ""}\n§r§8${ROLE_NAME[m.role]} · ${on}`);
  }
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled) return;
  if (res.selection === list.length) return mainMenu(player);
  const [targetId, m] = list[res.selection];
  if (targetId === player.id) return membersMenu(player);
  return memberActions(player, targetId, m.name);
}

async function memberActions(player, targetId, targetName) {
  const clan = clanOf(player);
  if (!clan?.members[targetId]) return membersMenu(player);
  const mine = roleOf(clan, player.id);
  const theirs = roleOf(clan, targetId);
  const actions = [];
  if (canManage(clan, player.id) && theirs === ROLE.member) actions.push(["Promote to Co-Owner", () => promoteMember(player, targetId)]);
  if (mine === ROLE.owner && theirs === ROLE.coowner) actions.push(["Demote to Member", () => demoteMember(player, targetId)]);
  if (canManage(clan, player.id) && ROLE_ORDER[theirs] > ROLE_ORDER[mine])
    actions.push(["§4Kick", () => kickMember(player, targetId), `Kick ${targetName} from ${clan.name}?`]);
  if (mine === ROLE.owner)
    actions.push(["Transfer Leadership", () => transferLeadership(player, targetId), `Make ${targetName} the Owner? You become a Co-Owner.`]);

  const form = new ActionFormData()
    .title(targetName)
    .body(`§7${ROLE_NAME[theirs]} · joined ${new Date(clan.members[targetId].joined).toDateString()}`);
  for (const [label] of actions) form.button(label);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled) return;
  const pick = actions[res.selection];
  if (!pick) return membersMenu(player);
  if (pick[2] && !(await confirm(player, pick[0].replace(/§./g, ""), pick[2]))) return memberActions(player, targetId, targetName);
  const r = pick[1]();
  report(player, r);
  if (r.kickedId) {
    const kicked = world.getEntity(r.kickedId);
    if (kicked) clearIslandSpawn(kicked);
  }
  return membersMenu(player);
}

// ---------------------------------------------------------------------------
// Invite / leave / disband
// ---------------------------------------------------------------------------

async function inviteMenu(player) {
  const candidates = world.getPlayers().filter((p) => p.id !== player.id && !clanOf(p));
  if (candidates.length === 0) {
    player.sendMessage(`${CONFIG.prefix}Nobody online is without a clan right now.`);
    return;
  }
  const form = new ActionFormData().title("Invite a Player").body("§7Online players with no clan:");
  for (const p of candidates) form.button(p.name);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  const target = candidates[res.selection];
  if (target?.isValid) report(player, invitePlayer(player, target));
}

async function leaveMenu(player) {
  const clan = clanOf(player);
  if (!clan) return;
  if (!(await confirm(player, "Leave Clan", `Leave §b${clan.name}§r? You lose access to its island.`, "Leave"))) return;
  const r = leaveClan(player);
  report(player, r);
  if (r.ok) clearIslandSpawn(player);
}

async function disbandMenu(player) {
  const clan = clanOf(player);
  if (!clan) return;
  if (!(await confirm(player, "Disband Clan", `Disband §b${clan.name}§r for everyone? The island is lost. This can't be undone.`, "Disband")))
    return;
  const members = Object.keys(clan.members);
  const r = disbandClan(player);
  report(player, r);
  if (r.ok) for (const id of members) {
    const p = world.getEntity(id);
    if (p) clearIslandSpawn(p);
  }
}
