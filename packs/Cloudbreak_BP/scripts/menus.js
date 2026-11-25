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
import { adminMenu, sellMenu, shopMenu, skyShopMenu } from "./eco/menus.js";
import { playerSettingsMenu } from "./eco/playerSettings.js";
import { ecoTitle } from "./eco/ui.js";
import * as R from "./raids.js";
import * as A from "./after.js";

// Floors that later milestones fill in (raids, insurance, raid log, leaderboards).
const floorHooks = {};
export const setFloor = (id, fn) => (floorHooks[id] = fn);

// Milestone 1 uses plain Bedrock forms. Milestone 6 swaps in the chosen
// custom layouts (Elevator Tower, Chain of Command, ...) from the resource pack.

// Cloudbreak icons (textures/ui/cb, built by tools/build_cloudbreak_ui.py)
const CB = new Proxy({}, { get: (_, name) => `textures/ui/cb/icon_${String(name)}` });
const UPGRADE_ICON = { size: CB.size, sell: CB.sell, fly: CB.fly, ore: CB.ore, spawners: CB.spawners, crops: CB.crops, shield: CB.insurance, defence: CB.clock, lives: CB.heart };

/** A form drawn with the styled tile layout (title bar in a theme colour, icon tiles). */
function styled(theme = "blue") {
  return {
    styledTheme: theme, _title: "", _body: "", _buttons: [],
    title(t) { this._title = t; return this; },
    body(b) { this._body = b; return this; },
    button(text, icon) { this._buttons.push([text, icon]); return this; },
  };
}

function toForm(f) {
  if (!f.styledTheme) return f;
  const form = new ActionFormData().title(ecoTitle(f._title, f.styledTheme)).body(f._body);
  for (const [text, icon] of f._buttons) {
    const [head, ...rest] = String(text).split("\n");
    const label = /^§[0-9a-f]/.test(head) ? head : `§f§l${head.toUpperCase()}`;
    const t = rest.length ? `${label}\n§r${rest.join(" ")}` : label;
    if (icon) form.button(t, icon);
    else form.button(t);
  }
  return form;
}

/** form.show() that waits while the player is busy (e.g. chat still open). */
async function show(player, rawForm) {
  const form = toForm(rawForm);
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
  const form = styled("orange").title(title).body(body).button(`§a§l${yes.toUpperCase()}`, CB.yes).button("§c§lCANCEL", CB.no);
  const res = await show(player, form);
  return !!res && !res.canceled && res.selection === 0;
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

export async function mainMenu(player, result) {
  if (result?.msg) report(player, result);
  const clan = clanOf(player);
  return clan ? clanMenu(player, clan) : noClanMenu(player);
}

async function noClanMenu(player) {
  const inv = pendingInvite(player);
  const buttons = [];
  if (inv) buttons.push({ text: `§a§lACCEPT INVITE\n§r§7${inv.clan.name} · from ${inv.fromName}`, icon: CB.yes, run: () => acceptAndGoHome(player) });
  buttons.push({ text: "§b§lCREATE A CLAN\n§r§7Get your own island", icon: CB.home, run: () => createMenu(player) });
  if (inv) buttons.push({ text: "§c§lDECLINE INVITE", icon: CB.no, run: () => report(player, declineInvite(player)) });
  const form = styled("cyan")
    .title(CONFIG.serverName.toUpperCase())
    .body("§7You are not in a clan yet.\n\nCreate one to get an island, or ask a clan to invite you.");
  for (const b of buttons) form.button(b.text, b.icon);
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
    { n: 9, icon: CB.settings, text: "Settings", sub: "Chunk borders, full bright, raid sound, coords", run: () => playerSettingsMenu(player, () => mainMenu(player)) },
    { n: 8, icon: CB.leaderboards, text: "Leaderboards", sub: "Raid wins, streaks, richest, core level", run: () => leaderboardsMenu(player) },
    { n: 7, icon: CB.raidlog, text: "Raid Log", sub: "Raids you did and raids on you", run: () => raidLogMenu(player) },
    { n: 6, icon: CB.members, text: "Members", sub: `${online} / ${memberCount(clan)} online`, run: () => membersMenu(player) },
    { n: 5, icon: CB.insurance, text: "Insurance", sub: "Get stolen money back", run: () => insuranceMenu(player) },
    { n: 4, icon: CB.shop, text: "Sky Shop", sub: "Buy and sell", run: () => skyShopMenu(player) },
    { n: 3, icon: CB.bank, text: "Clan Bank", sub: `${fmtMoney(bankOf(clan))} · ${hoursCovered(clan)}h of tax`, run: () => bankMenu(player) },
    { n: 2, icon: CB.raids, text: "Raids", sub: "Buy a raid", run: () => raidMenu(player) },
    { n: 1, icon: CB.home, text: "Island Home", sub: "Teleport to your island", run: () => (R.raidOfPlayer(player) ? report(player, { ok: false, msg: "You're in a raid. Finish it, or back out with /sc back." }) : sendHome(player, clan)) },
  ];
  const buttons = floors.map((f) => ({ text: `§b§lF${f.n} §f§l${f.text.toUpperCase()}\n§r§7${f.sub}`, icon: f.icon, run: f.run }));
  if (player.hasTag("admin")) buttons.push({ text: "§d§lADMIN\n§r§7Server tools", icon: CB.admin, run: () => (floorHooks.admin ? floorHooks.admin(player) : adminMenu(player)) });
  const form = styled("cyan")
    .title(`${CONFIG.serverName} · ${clan.name}`)
    .body(
      `§7Clan §b${clan.name}§7 · ${ROLE_NAME[role]} · ${memberCount(clan)}/${CONFIG.clan.maxMembers} players\n` +
        `§7Bank §a${fmtMoney(bankOf(clan))}§7 · Shield ${shieldUp(clan) ? "§aONLINE" : "§cDOWN"}`
    );
  for (const b of buttons) form.button(b.text, b.icon);
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
  const form = styled("gold")
    .title("Clan Bank")
    .body(
      (msg ? msg + "\n\n" : "") +
        `§7Balance §a${fmt(bankOf(clan))}\n§7Core tax §f${fmt(CONFIG.core.taxPerHour)}/hour§7 · next in §f${minutesToTax(clan)} min§7 online\n` +
        `§7Covers §f${hoursCovered(clan)} hours§7 · your wallet §a${fmt(getBalance(player))}\n\n§fLedger\n` +
        (ledger.length ? ledger.join("\n") : "§8No transactions yet.")
    );
  const buttons = [{ text: "§a§lDEPOSIT\n§r§7From your wallet", icon: CB.bank, run: () => amountMenu(player, "Deposit", deposit) }];
  if (manage) buttons.push({ text: "§c§lWITHDRAW\n§r§7To your wallet", icon: CB.sell, run: () => amountMenu(player, "Withdraw", withdraw) });
  buttons.push({ text: "§cBACK\n§r§7Go back", icon: CB.back, run: () => mainMenu(player) });
  for (const b of buttons) form.button(b.text, b.icon);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  await buttons[res.selection]?.run();
}

const QUICK = [1000, 10000, 100000, 1000000];

async function amountMenu(player, label, action) {
  const form = styled("gold").title(label).body(`§7Your wallet §a${fmt(getBalance(player))}§7 · clan bank §a${fmt(bankOf(clanOf(player)))}`);
  const picks = QUICK.map((v) => ({ text: fmtMoney(v), v }));
  picks.push({ text: "All", v: "all" }, { text: "Other amount...", v: "custom" }, { text: "Back", v: "back" });
  for (const p of picks) form.button(p.text, p.icon ?? CB.bank);
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
  const pips = (n, max, on = "§b", off = "§8") => on + "■".repeat(n) + off + "■".repeat(max - n);
  const hours = hoursCovered(clan);
  const covered = Math.max(0, Math.min(10, Math.round(hours / 24))); // one bar per day of tax, up to 10

  // Built by hand (not styled()): this form uses the Core Terminal screen, ui/cb_terminal.json.
  // Buttons are tagged: [MOD] module card, [DEP] deposit, [TAB] bottom tab ([ON] = open), [HDR] line above the cards.
  const form = new ActionFormData()
    .title(`§c§t§m§r§7${clan.name} · Bank §e${fmtMoney(bankOf(clan))}${up ? "[ON]" : "[DOWN]"}`)
    .body(
      `§7ISLAND CORE\n§fLEVEL ${coreLevel(clan)}\n\n` +
        `§7Upkeep §f${fmtMoney(CONFIG.core.taxPerHour)}/hr\n` +
        `§7Next charge §f${minutesToTax(clan)} min\n` +
        `§7Bank covers ${hours >= 24 ? "§a" : "§c"}${hours}h\n` +
        pips(covered, 10, "§a", "§8")
    );
  const actions = [];
  for (const u of UPGRADES) {
    const lvl = levelOf(clan, u.id);
    const maxed = lvl >= u.max;
    const off = !up && u.id !== "size" && lvl > 0 ? " §c(off)" : "";
    const bars = u.max === 1 ? (lvl ? "§b■■■■■■■■" : "§8■■■■■■■■") : pips(lvl, u.max);
    const foot = maxed ? (u.max === 1 ? "§aOWNED" : "§aMAXED") : `§e${fmtMoney(upgradeCost(u, lvl + 1))}  §b» UPGRADE`;
    form.button(`[MOD]§f${u.name} §8Lv ${lvl}/${u.max}${off}\n${bars}\n§7${u.desc(maxed ? lvl : lvl + 1)}\n${foot}`, UPGRADE_ICON[u.id]);
    actions.push(() => upgradeFlow(player, u));
  }
  form.button("[DEP]DEPOSIT TO BANK");
  actions.push(() => amountMenu(player, "Deposit", deposit));
  const tabs = [
    ["Modules", () => coreTerminal(player), true],
    ["Upkeep", () => bankMenu(player)],
    ["Raid Log", () => raidLogMenu(player)],
    ["Insurance", () => insuranceMenu(player)],
    ["Settings", () => playerSettingsMenu(player, () => coreTerminal(player))],
  ];
  for (const [name, run, on] of tabs) {
    form.button(`[TAB]${on ? "[ON]§f" : ""}${name}`);
    actions.push(run);
  }
  form.button(`[HDR]${msg ? msg : "§fCore Modules  §8Upgrades only work while upkeep is paid"}`);
  actions.push(() => coreTerminal(player, msg));

  const res = await show(player, form);
  if (!res || res.canceled) return;
  await actions[res.selection]?.();
}

async function upgradeFlow(player, u) {
  const clan = clanOf(player);
  if (!clan) return;
  const lvl = levelOf(clan, u.id);
  if (lvl >= u.max) return coreTerminal(player, `§7${u.name} is maxed.`);
  const cost = upgradeCost(u, lvl + 1);
  if (!(await confirm(player, u.name, `Upgrade ${u.name} to level ${lvl + 1} for ${fmt(cost)} from the clan bank?\n\n${u.desc(lvl + 1)}`, "Upgrade")))
    return coreTerminal(player);
  const r = buyUpgrade(player, u.id);
  return coreTerminal(player, (r.ok ? "§a" : "§c") + r.msg);
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
  const form = styled("blue").title(`Members · ${clan.name}`).body("§7Pick a player to see what you can do.");
  for (const [id, m] of list) {
    const on = world.getEntity(id) ? "§2online" : "§8offline";
    form.button(`§f${m.name}${id === player.id ? " §8(you)" : ""}\n§r§8${ROLE_NAME[m.role]} · ${on}`, m.role === "owner" ? CB.crown : CB.members);
  }
  form.button("§cBACK\n§r§7Go back", CB.back);
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

  const form = styled("blue")
    .title(targetName)
    .body(`§7${ROLE_NAME[theirs]} · joined ${new Date(clan.members[targetId].joined).toDateString()}`);
  for (const [label] of actions) form.button(label, CB.members);
  form.button("§cBACK\n§r§7Go back", CB.back);
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
  const form = styled("blue").title("Invite a Player").body("§7Online players with no clan:");
  for (const p of candidates) form.button(`§f${p.name}`, CB.members);
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

// ---------------------------------------------------------------------------
// Raid Dispatch
// ---------------------------------------------------------------------------

const RAID_TYPES = [
  { type: "normal", name: "Normal Raid", sub: "Random clan, no info" },
  { type: "intel", name: "Intel Raid", sub: "See a hint first, then deploy or walk away" },
  { type: "cheap", name: "Cheap Raid", sub: "Half price: an island whose core tax is unpaid" },
  { type: "revenge", name: "Revenge Raid", sub: "Hit the clan that raided you" },
];

export async function raidMenu(player, msg) {
  const clan = clanOf(player);
  if (!clan) return mainMenu(player);
  const running = R.raidOfClan(clan.id);
  const manage = canManage(clan, player.id);
  const revenge = R.revengeAvailable(clan);
  const cheapCount = R.targetsFor(clan, "cheap").length;
  const lines = [
    msg ? msg + "\n" : "",
    `§7Clan bank §a${fmt(bankOf(clan))}§7 · squad: everyone online (${onlineMembersOf(clan)})`,
    `§7Islands with their shield down: §f${cheapCount}`,
    revenge ? `§cRevenge available on §e${revenge.name}§c until ${new Date(clan.revenge.until).toLocaleTimeString()}` : "",
    running ? `§6Your clan is in a raid right now.` : "",
    manage ? "" : "§8Only the Owner and Co-Owners can buy raids.",
  ].filter(Boolean);
  const form = styled("red").title("Raid Dispatch").body(lines.join("\n"));
  const opts = [];
  if (running && R.raidOfPlayer(player)) opts.push({ text: "§c§lBACK OUT\n§r§7Within 30s of arriving, 50% refund", icon: CB.stop, run: () => mainMenu(player, R.backOut(player)) });
  if (!running && manage) {
    for (const t of RAID_TYPES) {
      if (t.type === "revenge" && !revenge) continue;
      opts.push({ text: `§c§l${t.name.toUpperCase()} §r§e${fmtMoney(R.priceOf(t.type))}\n§r§7${t.sub}`, icon: { normal: CB.raids, intel: CB.intel, cheap: CB.broken, revenge: CB.skull }[t.type], run: () => startRaid(player, t.type) });
    }
  }
  opts.push({ text: "§cBACK\n§r§7Go back", icon: CB.back, run: () => mainMenu(player) });
  for (const o of opts) form.button(o.text, o.icon);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  await opts[res.selection]?.run();
}

const onlineMembersOf = (clan) => Object.keys(clan.members).filter((id) => world.getEntity(id)).length;

const intelCooldown = new Map();

async function startRaid(player, type) {
  const prep = R.prepareRaid(player, type);
  if (!prep.ok) return raidMenu(player, "§c" + prep.msg);
  if (type === "intel") {
    // scouting is free, but only once a minute per clan (no endless re-rolls)
    const last = intelCooldown.get(prep.clan.id) ?? 0;
    if (Date.now() - last < 60000) return raidMenu(player, `§cYour scouts need ${Math.ceil((60000 - (Date.now() - last)) / 1000)}s before the next Intel Raid.`);
    intelCooldown.set(prep.clan.id, Date.now());
    const intel = R.intelOf(prep.target);
    const ok = await confirm(
      player,
      "Intel Report",
      `§7A target has been scouted:\n\n§fSpawners: §e${intel.spawners}\n§fClan bank: §e${intel.bank}\n§fOnline: §e${intel.online} / ${intel.members}\n\n§7Deploy now for ${fmt(prep.price)}, or walk away for free.`,
      "Deploy"
    );
    if (!ok) return raidMenu(player, "§7You walked away. Nothing was paid.");
  } else {
    const ok = await confirm(player, "Buy Raid", `Buy a ${type} raid for ${fmt(prep.price)} from the clan bank? Everyone online in your clan goes.`, "Raid!");
    if (!ok) return raidMenu(player);
  }
  const r = await R.launchRaid(player, prep);
  if (!r.ok) return raidMenu(player, "§c" + r.msg);
}

// ---------------------------------------------------------------------------
// Insurance Vault, Raid Log, Leaderboards
// ---------------------------------------------------------------------------

export async function insuranceMenu(player, msg) {
  const clan = clanOf(player);
  if (!clan) return mainMenu(player);
  const owned = clan.insurance ?? 0;
  const tiers = CONFIG.insurance;
  const lines = tiers.map((t, i) => `${i < owned ? "§a✔" : i === owned ? "§e›" : "§8✖"} §f${t.name} §7${Math.round(t.pct * 100)}% back · ${fmt(t.price)}`);
  const form = styled("green")
    .title("Insurance Vault")
    .body(
      (msg ? msg + "\n\n" : "") +
        "§7Get part of the money back when your clan is raided. Covers money only. Buy the tiers in order; the best one you own counts.\n\n" +
        lines.join("\n") +
        `\n\n§7Clan bank §a${fmt(bankOf(clan))}`
    );
  const opts = [];
  if (owned < tiers.length) opts.push({ text: `§a§lBUY ${tiers[owned].name.toUpperCase()} §r§e${fmtMoney(tiers[owned].price)}\n§r§7${Math.round(tiers[owned].pct * 100)}% of stolen money back`, icon: CB.insurance, run: async () => {
    if (!(await confirm(player, "Insurance", `Buy ${tiers[owned].name} insurance for ${fmt(tiers[owned].price)} from the clan bank?`, "Buy"))) return insuranceMenu(player);
    const r = A.buyInsurance(player);
    return insuranceMenu(player, (r.ok ? "§a" : "§c") + r.msg);
  } });
  opts.push({ text: "§cBACK\n§r§7Go back", icon: CB.back, run: () => mainMenu(player) });
  for (const o of opts) form.button(o.text, o.icon);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  await opts[res.selection]?.run();
}

const LOG_LABEL = {
  won: "§aRAID WON",
  failed: "§7RAID FAILED",
  defended: "§bDEFENDED",
  raided: "§cRAIDED",
  backout: "§8CALLED OFF",
};

export async function raidLogMenu(player, filter = "all") {
  const clan = clanOf(player);
  if (!clan) return mainMenu(player);
  const mine = ["won", "failed", "backout"];
  const list = (clan.log ?? []).filter((e) => filter === "all" || (filter === "ours" ? mine.includes(e.kind) : !mine.includes(e.kind)));
  const st = clan.stats ?? {};
  const ago = (t) => {
    const m = Math.floor((Date.now() - t) / 60000);
    return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
  };
  const body =
    `§7Wins §a${st.wins ?? 0}§7 · losses §c${st.losses ?? 0}§7 · defences §b${st.defences ?? 0}§7 · streak §f${st.streak ?? 0}\n\n` +
    (list.length
      ? list.slice(0, 15).map((e) => `${LOG_LABEL[e.kind] ?? e.kind} §f${e.other} §7${e.money >= 0 ? "§a+" : "§c-"}${fmt(Math.abs(e.money))} §8${ago(e.t)}\n §8${e.detail ?? ""}`).join("\n")
      : "§8Nothing here yet.");
  const form = styled("orange").title("Raid Log").body(body);
  const tabs = [["all", "All"], ["ours", "Our raids"], ["theirs", "Raids on us"]];
  for (const [id, label] of tabs) form.button(`${id === filter ? "§e§l" : ""}${label}`, CB.raidlog);
  form.button("§cBACK\n§r§7Go back", CB.back);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  if (res.selection < tabs.length) return raidLogMenu(player, tabs[res.selection][0]);
  return mainMenu(player);
}

export async function leaderboardsMenu(player, id = "wins") {
  const own = clanOf(player);
  const rows = A.board(id);
  const b = A.BOARDS.find((x) => x.id === id) ?? A.BOARDS[0];
  const rank = own ? rows.findIndex((r) => r.clan.id === own.id) + 1 : 0;
  const top = rows.slice(0, 10).map((r, i) => `${i < 3 ? ["§6", "§f", "§c"][i] : "§7"}#${i + 1} §f${r.clan.name} §7${r.text}${own && r.clan.id === own.id ? " §b(you)" : ""}`);
  const form = styled("purple")
    .title(`Leaderboards · ${b.name}`)
    .body((top.length ? top.join("\n") : "§8No clans yet.") + (own && rank > 10 ? `\n\n§b#${rank} ${own.name} §7${rows[rank - 1].text}` : ""));
  for (const x of A.BOARDS) form.button(`${x.id === id ? "§e§l" : ""}${x.name}`, { wins: CB.raids, streak: CB.insurance, richest: CB.bank, core: CB.core }[x.id]);
  form.button("§cBACK\n§r§7Go back", CB.back);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  if (res.selection < A.BOARDS.length) return leaderboardsMenu(player, A.BOARDS[res.selection].id);
  return mainMenu(player);
}
