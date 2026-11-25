import { system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG, ROLE, ROLE_NAME } from "./config.js";
import {
  acceptInvite,
  allClans,
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
import { buyUpgrade, coreLevel, hoursCovered, levelOf, minutesToTax, raidLives, shieldUp, upgradeCost } from "./core.js";
import { UPGRADES } from "./config.js";
import { fmt, fmtMoney, getBalance, sellMultiplier } from "./eco/economy.js";
import { adminMenu, skyShopMenu } from "./eco/menus.js";
import { playerSettingsMenu, settingsOnCount } from "./eco/playerSettings.js";
import { ecoTitle } from "./eco/ui.js";
import { ART, BANNER, Screen, headFor, setBack, setDefaultBack, spaced } from "./screens.js";
import * as R from "./raids.js";
import * as A from "./after.js";
import { isAdmin } from "./admin_check.js";

// Hooks other parts fill in (admin panel, tax after a deposit).
const floorHooks = {};
export const setFloor = (id, fn) => (floorHooks[id] = fn);

// Cloudbreak icons (textures/ui/cb, built by tools/build_cloudbreak_ui.py)
const CB = new Proxy({}, { get: (_, name) => `textures/ui/cb/icon_${String(name)}` });
const UPGRADE_ICON = { size: CB.size, sell: CB.sell, fly: CB.fly, spawners: CB.spawners, crops: CB.crops, shield: CB.insurance, defence: CB.clock, lives: CB.heart };

/** Small confirm/info dialogs still use the coloured tile layout. */
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

export async function confirm(player, title, body, yes = "Yes") {
  const form = styled("orange").title(title).body(body).button(`§a§l${yes.toUpperCase()}`, CB.yes).button("§c§lCANCEL", CB.no);
  const res = await show(player, form);
  return !!res && !res.canceled && res.selection === 0;
}

const onlineIds = (clan) => Object.keys(clan.members).filter((id) => world.getEntity(id));
const ago = (t) => {
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};
const signed = (n) => `${n >= 0 ? "+" : "-"}${fmt(Math.abs(n))}`;

// ---------------------------------------------------------------------------
// Main menu: one tile per menu, one tap opens it. (The Core Terminal is NOT
// here: it only opens by tapping the Island Core block.)
// ---------------------------------------------------------------------------

setDefaultBack((player) => tower(player));

export async function mainMenu(player, result) {
  if (result?.msg) report(player, result);
  return tower(player);
}

function tilesFor(player) {
  const clan = clanOf(player);
  const settings = { name: "Settings", icon: CB.settings, col: "GREY", sub: `${settingsOnCount(player)} of 4 on`, run: () => playerSettingsMenu(player) };
  const boards = { name: "Leaderboards", icon: CB.leaderboards, col: "PURPLE", sub: "Top clans", run: () => leaderboardsMenu(player) };
  const shop = { name: "Sky Shop", icon: CB.shop, col: "GOLD", sub: "Buy & sell", run: () => skyShopMenu(player) };
  const admin = isAdmin(player)
    ? [{ name: "Admin", icon: CB.admin, col: "PINK", sub: "Control Room", run: () => (floorHooks.admin ? floorHooks.admin(player) : adminMenu(player)) }]
    : [];
  if (!clan) {
    const inv = pendingInvite(player);
    const tiles = [{ name: "Create Clan", icon: CB.home, col: "CYAN", sub: "Get an island", run: () => createMenu(player) }];
    if (inv) {
      tiles.push({ name: "Join Clan", icon: CB.yes, col: "GREEN", sub: inv.clan.name, run: () => acceptAndGoHome(player) });
      tiles.push({ name: "Decline", icon: CB.no, col: "RED", sub: `Invite from ${inv.fromName}`, run: () => report(player, declineInvite(player)) });
    }
    return [...tiles, shop, boards, settings, ...admin];
  }
  const st = clan.stats ?? {};
  const owned = clan.insurance ?? 0;
  const rank = A.board("wins").findIndex((r) => r.clan.id === clan.id) + 1;
  return [
    { name: "Island Home", icon: CB.home, col: "CYAN", sub: "Teleport home", run: () => (R.raidOfPlayer(player) ? report(player, { ok: false, msg: "You're in a raid. Finish it, or back out with /sc back." }) : sendHome(player, clan)) },
    { name: "Raids", icon: CB.raids, col: "RED", sub: `${R.targetsFor(clan, "cheap").length} shields down`, badge: !!R.revengeAvailable(clan), run: () => raidMenu(player) },
    { name: "Clan Bank", icon: CB.bank, col: "GOLD", sub: `${fmtMoney(bankOf(clan))} · ${hoursCovered(clan)}h tax`, run: () => bankMenu(player) },
    shop,
    { name: "Insurance", icon: CB.insurance, col: "GREEN", sub: owned ? `${CONFIG.insurance[owned - 1].name} · ${Math.round(CONFIG.insurance[owned - 1].pct * 100)}%` : "No cover yet", run: () => insuranceMenu(player) },
    { name: "Members", icon: CB.members, col: "TEAL", sub: `${onlineIds(clan).length} / ${memberCount(clan)} online`, run: () => membersMenu(player) },
    { name: "Raid Log", icon: CB.raidlog, col: "ORANGE", sub: `${st.wins ?? 0} W · ${st.losses ?? 0} L`, run: () => raidLogMenu(player) },
    { ...boards, sub: rank ? `You're #${rank}` : "Top clans" },
    settings,
    ...admin,
  ];
}

// $184K style, so the money badges fit on one line
const compact = (n) => (n >= 1e6 ? fmtMoney(n) : n >= 1000 ? `$${Math.floor(n / 1000)}K` : fmt(n));

export async function tower(player) {
  const clan = clanOf(player);
  const s = new Screen("tower", "Main Menu");
  // Back on any menu opened from here returns to this main menu
  for (const t of tilesFor(player)) s.button("TL", `§f${t.name}\n§7${t.sub}`, () => (setBack(player, tower), t.run()), { icon: t.icon, states: [`c${t.col}`, t.badge ? "BADGE" : undefined] });
  s.text("K", spaced(clan ? `Clan ${clan.name} · ${ROLE_NAME[roleOf(clan, player.id)]} · ${onlineIds(clan).length} / ${memberCount(clan)} online` : "No clan yet"));
  if (clan) s.text("PILL", `Bank §e${compact(bankOf(clan))}`);
  s.text("PILL", `Wallet §a${compact(getBalance(player))}`);
  if (clan) s.text("PILL", `Shield ${shieldUp(clan) ? "§aONLINE" : "§cDOWN"}`);
  await s.show(player);
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
  if (!res || res.canceled) return tower(player);
  const r = createClan(player, String(res.formValues?.[0] ?? ""));
  report(player, r);
  if (r.ok) await createIsland(player, r.clan);
}

// ---------------------------------------------------------------------------
// Clan Bank: Coin Tower
// ---------------------------------------------------------------------------

const QUICK = [["$1k", 1000], ["$10k", 10000], ["$100k", 100000], ["$1M", 1000000], ["ALL", "all"]];
const ledgerIcon = (l) => {
  const w = l.what.toLowerCase();
  if (w.includes("withdr")) return ART("arrow_down");
  if (w.includes("tax")) return CB.clock;
  if (w.includes("raided") || w.includes("stolen")) return CB.broken;
  if (w.includes("raid")) return CB.raids;
  if (w.includes("insurance")) return CB.insurance;
  if (w.includes("upgrade")) return CB.core;
  return l.amt >= 0 ? ART("arrow_up") : ART("arrow_down");
};

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
function ledgerLine(l) {
  const w = String(l.what);
  if (/^deposit/i.test(w) && l.who) return `${l.who} deposited`;
  if (/^withdr/i.test(w) && l.who) return `${l.who} withdrew`;
  return w;
}

export async function bankMenu(player, opts = {}) {
  const clan = clanOf(player);
  if (!clan) return tower(player);
  if (typeof opts === "string") opts = { msg: opts };
  const manage = canManage(clan, player.id);
  const mode = opts.mode === "withdraw" && manage ? "withdraw" : "deposit";
  const amt = opts.amt ?? 100000;
  const again = (o) => bankMenu(player, { mode, amt, ...o });
  const hours = hoursCovered(clan);
  const bars = 22;
  const lit = Math.max(0, Math.min(bars, Math.round((Math.min(hours, 400) / 400) * bars)));
  const s = new Screen("bank", "Clan Bank");
  for (let i = 0; i < bars; i++) s.text("CN", "", { states: [i >= bars - lit ? "ON" : undefined] });
  s.text("HR", `${hours} hours`);
  s.text("K", spaced(`Clan ${clan.name}`));
  s.text("BAL", fmt(bankOf(clan)));
  s.text("TAX", `Core tax ${fmt(CONFIG.core.taxPerHour)} / hr · next charge in ${minutesToTax(clan)} min`);
  s.button("MODE", `${mode === "deposit" ? "§0" : "§f"}DEPOSIT`, () => again({ mode: "deposit" }), { states: [mode === "deposit" ? "ON" : undefined] });
  s.button("MODE", `${mode === "withdraw" ? "§0" : manage ? "§f" : "§8"}WITHDRAW`, () => (manage ? again({ mode: "withdraw" }) : again({ msg: "§cOnly the Owner and Co-Owners can withdraw." })), { states: [mode === "withdraw" ? "ON" : undefined] });
  for (const [label, v] of QUICK) s.button("AMT", label, () => again({ amt: v }), { states: [amt === v ? "ON" : undefined] });
  s.button("AMT", "Other", async () => {
    const m = await show(player, new ModalFormData().title(mode === "deposit" ? "Deposit" : "Withdraw").textField("Amount", "e.g. 25000"));
    if (!m || m.canceled) return again({});
    const v = Math.floor(Number(String(m.formValues?.[0] ?? "").replace(/[$,\s]/g, "")));
    return again({ amt: Number.isFinite(v) && v > 0 ? v : amt });
  }, { states: [QUICK.some(([, v]) => v === amt) ? undefined : "ON"] });
  if (opts.msg) s.text("MSG", opts.msg);
  const wallet = getBalance(player);
  const value = amt === "all" ? (mode === "deposit" ? wallet : bankOf(clan)) : amt;
  s.text("CF", `${mode === "deposit" ? "Deposit" : "Withdraw"} §e${fmt(value)}§7 · wallet ${fmtMoney(wallet)}`);
  s.button("OK", "CONFIRM", () => {
    const r = (mode === "deposit" ? deposit : withdraw)(player, value);
    if (r.ok && mode === "deposit") floorHooks.afterDeposit?.(r.clan);
    return again({ msg: (r.ok ? "§a" : "§c") + r.msg });
  }, { states: [value > 0 ? undefined : "OFF"] });
  for (const l of (clan.ledger ?? []).slice(0, 8)) {
    s.text("LG", `§f${clip(ledgerLine(l), 16)}\n§8${ago(l.t)}`, { icon: ledgerIcon(l) });
    s.text("LA", `${l.amt >= 0 ? "§a" : "§c"}${signed(l.amt)}`);
  }
  await s.show(player);
}

// ---------------------------------------------------------------------------
// Core Terminal (opened by tapping the Island Core)
// ---------------------------------------------------------------------------

export async function coreTerminal(player, msg) {
  const clan = clanOf(player);
  if (!clan) return;
  const up = shieldUp(clan);
  const pips = (n, max) => "§b" + "■".repeat(n) + "§8" + "■".repeat(max - n);
  const hours = hoursCovered(clan);
  const s = new Screen("terminal", "Core Terminal");
  for (const u of UPGRADES) {
    const lvl = levelOf(clan, u.id);
    const maxed = lvl >= u.max;
    const off = !up && u.id !== "size" && lvl > 0;
    const bars = u.max === 1 ? (lvl ? "§b■■■■■■■■" : "§8■■■■■■■■") : pips(lvl, u.max);
    const foot = maxed ? (u.max === 1 ? "§aOWNED" : "§aMAXED") : `§e${fmtMoney(upgradeCost(u, lvl + 1))}`;
    s.button("MOD", `§f${u.name} §8${lvl}/${u.max}${off ? " §c(off)" : ""}\n${bars}\n§7${u.desc(maxed ? lvl : lvl + 1)}\n${foot}`, () => upgradeFlow(player, u), {
      icon: UPGRADE_ICON[u.id], states: [maxed ? "MAX" : undefined, off ? "OFF" : undefined],
    });
  }
  s.text("HC", `Clan ${clan.name}`);
  s.text("BK", `§7Clan bank §e${fmtMoney(bankOf(clan))}`);
  s.text("SH", up ? "§aSHIELD ONLINE" : "§cSHIELD DOWN", { states: [up ? undefined : "DOWN"] });
  s.text("CL", spaced(`Island Core · Level ${coreLevel(clan)}`));
  s.text("UPV", `§f${fmtMoney(CONFIG.core.taxPerHour)} / hr\n§f${minutesToTax(clan)} min\n${hours >= 24 ? "§a" : "§c"}${hours} hours`);
  const lit = Math.max(0, Math.min(10, Math.round(hours / 24)));
  for (let i = 0; i < 10; i++) s.text("BAR", "", { states: [i < lit ? "ON" : undefined] });
  const fromCore = (fn) => () => (setBack(player, (p) => coreTerminal(p)), fn());
  s.button("DEP", "DEPOSIT TO BANK", fromCore(() => bankMenu(player, { mode: "deposit" })));
  s.text("HDR", msg ?? "Upgrades only work while upkeep is paid");
  const tabs = [
    ["Modules", () => coreTerminal(player), true],
    ["Upkeep", fromCore(() => bankMenu(player))],
    ["Raid Log", fromCore(() => raidLogMenu(player))],
    ["Insurance", fromCore(() => insuranceMenu(player))],
    ["Settings", fromCore(() => playerSettingsMenu(player))],
  ];
  for (const [name, run, on] of tabs) s.button("TAB", on ? `§f${name}` : name, run, { states: [on ? "ON" : undefined] });
  await s.show(player);
}

async function upgradeFlow(player, u) {
  const clan = clanOf(player);
  if (!clan) return;
  const lvl = levelOf(clan, u.id);
  if (lvl >= u.max) return coreTerminal(player, `§7${u.name} is maxed.`);
  // one tap upgrades straight away (no confirm screen); the result shows above the cards
  const r = buyUpgrade(player, u.id);
  if (r.ok) player.playSound("random.levelup", { volume: 0.6 });
  return coreTerminal(player, (r.ok ? "§a" : "§c") + r.msg);
}

// ---------------------------------------------------------------------------
// Members: Chain of Command
// ---------------------------------------------------------------------------

const ROLE_ORDER = { owner: 0, coowner: 1, member: 2 };

export async function membersMenu(player, selId) {
  const clan = clanOf(player);
  if (!clan) return tower(player);
  const list = Object.entries(clan.members).sort((a, b) => ROLE_ORDER[a[1].role] - ROLE_ORDER[b[1].role] || a[1].joined - b[1].joined);
  const sel = clan.members[selId] ? selId : player.id;
  const s = new Screen("members", "Members");
  s.text("K", spaced(`Clan ${clan.name}`));
  for (const [id, m] of list) {
    const zone = m.role === "owner" ? "OW" : m.role === "coowner" ? "CO" : "ME";
    const on = world.getEntity(id);
    s.button(zone, `§f${m.name}\n${on ? "§a■ Online" : "§8■ Offline"}`, () => membersMenu(player, id), {
      icon: headFor(m.name), states: [id === sel ? "SEL" : undefined, m.role === "owner" ? "OWN" : undefined],
    });
  }
  const open = CONFIG.clan.maxMembers - list.length;
  if (open > 0 && canManage(clan, player.id))
    s.button("ME", `§fInvite\n§8■ ${open} open`, () => inviteMenu(player), { icon: CB.plus });
  const m = clan.members[sel];
  const st = clan.stats ?? {};
  const days = Math.max(0, Math.floor((Date.now() - m.joined) / 864e5));
  s.text("SA", `§f${m.name}\n§7${ROLE_NAME[m.role]} · joined ${days ? `${days}d ago` : "today"}`, { icon: headFor(m.name) });
  const mine = roleOf(clan, player.id);
  const theirs = m.role;
  const act = (label, color, run, ask) => s.button("ACT", label, async () => {
    if (ask && !(await confirm(player, label.replace(/§./g, ""), ask))) return membersMenu(player, sel);
    const r = run();
    report(player, r);
    if (r.kickedId) {
      const kicked = world.getEntity(r.kickedId);
      if (kicked) clearIslandSpawn(kicked);
    }
    return clanOf(player) ? membersMenu(player, sel) : tower(player);
  }, { states: [color] });
  if (sel === player.id) {
    if (mine === ROLE.owner) act("§fDISBAND CLAN", "cRED", () => disbandAll(player), `Disband ${clan.name} for everyone? The island is lost. This can't be undone.`);
    else act("§fLEAVE CLAN", "cRED", () => leaveAndClear(player), `Leave ${clan.name}? You lose access to its island.`);
  } else {
    if (canManage(clan, player.id) && theirs === ROLE.member) act("§0PROMOTE", "cCYAN", () => promoteMember(player, sel));
    if (mine === ROLE.owner && theirs === ROLE.coowner) act("§fDEMOTE", undefined, () => demoteMember(player, sel));
    if (canManage(clan, player.id) && ROLE_ORDER[theirs] > ROLE_ORDER[mine]) act("§cKICK", "cRED", () => kickMember(player, sel), `Kick ${m.name} from ${clan.name}?`);
    if (mine === ROLE.owner)
      s.button("ACT2", "TRANSFER LEADERSHIP", async () => {
        if (!(await confirm(player, "Transfer Leadership", `Make ${m.name} the Owner? You become a Co-Owner.`))) return membersMenu(player, sel);
        report(player, transferLeadership(player, sel));
        return membersMenu(player, sel);
      });
  }
  await s.show(player);
}

function leaveAndClear(player) {
  const r = leaveClan(player);
  if (r.ok) clearIslandSpawn(player);
  return r;
}

function disbandAll(player) {
  const clan = clanOf(player);
  const ids = clan ? Object.keys(clan.members) : [];
  const r = disbandClan(player);
  if (r.ok) for (const id of ids) {
    const p = world.getEntity(id);
    if (p) clearIslandSpawn(p);
  }
  return r;
}

async function inviteMenu(player) {
  const candidates = world.getPlayers().filter((p) => p.id !== player.id && !clanOf(p));
  if (candidates.length === 0) {
    player.sendMessage(`${CONFIG.prefix}Nobody online is without a clan right now.`);
    return membersMenu(player);
  }
  const form = styled("blue").title("Invite a Player").body("§7Online players with no clan:");
  for (const p of candidates) form.button(`§f${p.name}`, headFor(p.name));
  form.button("§cBACK", CB.back);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  const target = candidates[res.selection];
  if (!target) return membersMenu(player);
  if (target.isValid) report(player, invitePlayer(player, target));
  return membersMenu(player);
}

// ---------------------------------------------------------------------------
// Raid Dispatch
// ---------------------------------------------------------------------------

const intelCooldown = new Map();
const scouted = new Map(); // clanId -> { prep, intel, until }

export async function raidMenu(player, msg) {
  const clan = clanOf(player);
  if (!clan) return tower(player);
  const running = R.raidOfClan(clan.id);
  const manage = canManage(clan, player.id);
  const rev = R.revengeAvailable(clan);
  const st = clan.stats ?? {};
  const s = new Screen("dispatch", "Raid Dispatch");
  s.text("K", spaced(`Clan ${clan.name} · War Table`));
  s.text("PILL", `Wins §a${st.wins ?? 0}`, { icon: CB.raids });
  s.text("PILL", `Losses §c${st.losses ?? 0}`, { icon: CB.skull });
  s.text("PILL", `Streak §e${st.streak ?? 0}`, { icon: CB.insurance });
  if (running && R.raidOfPlayer(player)) {
    s.button("RV", `§fYou're in a raid. §7Back out within ${CONFIG.raid.backOutSeconds}s of arriving for a ${Math.round(CONFIG.raid.backOutRefund * 100)}% refund.`, () => tower(player, R.backOut(player)), { icon: CB.stop });
    s.text("RVP", "BACK OUT");
  } else if (rev && !running) {
    s.button("RV", `§fRevenge available. §7Clan ${rev.name} raided you. Hit them back.`, () => (manage ? startRaid(player, "revenge") : raidMenu(player, "§cOnly the Owner and Co-Owners can buy raids.")), { icon: CB.raids });
    s.text("RVP", `REVENGE · ${fmtMoney(R.priceOf("revenge"))}`);
  }
  const intel = scouted.get(clan.id);
  const intelLive = intel && intel.until > Date.now() ? intel : undefined;
  const cheap = R.targetsFor(clan, "cheap").length;
  const cards = [
    { type: "normal", kick: "§6BLIND DROP", name: "Normal Raid", icon: CB.raids, pic: ART("qbox"), inner: "", desc: "Random clan. Could be loaded, could be empty. No info." },
    { type: "intel", kick: "§6SCOUTED FIRST", name: "Intel Raid", icon: CB.intel, on: true,
      inner: intelLive ? `§7INTEL REPORT\n§fSpawners §e${intelLive.intel.spawners}\n§fBank §e${intelLive.intel.bank}\n§fOnline §e${intelLive.intel.online} / ${intelLive.intel.members}\n§fClan §8■■■■■■` : "§7Scouting is free,\n§7once a minute.\n\n§7Tap to get a hint\n§7about a target.",
      desc: "See the hint, then deploy or walk away." },
    { type: "cheap", kick: "§cSHIELDS DOWN", name: "Cheap Raid", icon: CB.broken, red: true, pic: CB.broken, inner: `§7UNPAID UPKEEP\n§c${cheap} §7islands can't pay their core tax right now`, desc: "Half price. Random pick from the exposed islands." },
  ];
  for (const c of cards) {
    const price = fmtMoney(R.priceOf(c.type));
    let chip = c.type === "intel" ? (intelLive ? `DEPLOY · ${price}` : "SCOUT · FREE") : `BUY · ${price}`;
    if (!manage) chip = "OWNER / CO-OWNER";
    if (running) chip = "RAID RUNNING";
    s.button("RC", c.name, () => (running ? raidMenu(player, "§cYour clan is already in a raid.") : manage ? startRaid(player, c.type) : raidMenu(player, "§cOnly the Owner and Co-Owners can buy raids.")), { icon: c.icon, states: [c.on ? "ON" : undefined] });
    s.text("RCK", c.kick);
    s.text("RCX", "", { icon: c.pic });
    s.text("RCI", c.inner);
    s.text("RCD", msg && c.type === "normal" ? msg : c.desc);
    s.text("RCB", chip, { states: [c.red ? "cRED" : undefined] });
  }
  for (const [id, m] of Object.entries(clan.members)) {
    const on = world.getEntity(id);
    s.text("SQ", m.name, { icon: headFor(m.name) });
    s.text("SQS", on ? "§aREADY" : "§8OFFLINE");
  }
  s.text("FT", `§f${raidLives(clan)}\n§e${fmtMoney(bankOf(clan))}`);
  await s.show(player);
}

async function startRaid(player, type) {
  const clan = clanOf(player);
  if (type === "intel") {
    const live = scouted.get(clan.id);
    if (live && live.until > Date.now()) {
      // second tap: deploy on the scouted target
      if (!(await confirm(player, "Deploy", `Deploy on the scouted island for ${fmt(live.prep.price)} from the clan bank? Everyone online in your clan goes.`, "Deploy")))
        return raidMenu(player);
      scouted.delete(clan.id);
      const fresh = R.prepareRaid(player, "intel");
      if (!fresh.ok) return raidMenu(player, "§c" + fresh.msg);
      const r = await R.launchRaid(player, { ...fresh, target: live.prep.target });
      if (!r.ok) return raidMenu(player, "§c" + r.msg);
      return;
    }
    const prep = R.prepareRaid(player, "intel");
    if (!prep.ok) return raidMenu(player, "§c" + prep.msg);
    const last = intelCooldown.get(clan.id) ?? 0;
    if (Date.now() - last < 60000) return raidMenu(player, `§cYour scouts need ${Math.ceil((60000 - (Date.now() - last)) / 1000)}s before the next scout.`);
    intelCooldown.set(clan.id, Date.now());
    scouted.set(clan.id, { prep, intel: R.intelOf(prep.target), until: Date.now() + 60000 });
    return raidMenu(player);
  }
  const prep = R.prepareRaid(player, type);
  if (!prep.ok) return raidMenu(player, "§c" + prep.msg);
  const ok = await confirm(player, "Buy Raid", `Buy a ${type} raid for ${fmt(prep.price)} from the clan bank? Everyone online in your clan goes.`, "Raid!");
  if (!ok) return raidMenu(player);
  const r = await R.launchRaid(player, prep);
  if (!r.ok) return raidMenu(player, "§c" + r.msg);
}

// ---------------------------------------------------------------------------
// Insurance Vault
// ---------------------------------------------------------------------------

const TIER_LOOK = [
  { safe: "safe_basic", col: "§7", desc: "A small cushion for new clans." },
  { safe: "safe_silver", col: "§f", desc: "A quarter of it back." },
  { safe: "safe_gold", col: "§6", desc: "Half of every stolen dollar back." },
  { safe: "safe_diamond", col: "§3", desc: "Three quarters back. The best cover." },
];

export async function insuranceMenu(player, msg) {
  const clan = clanOf(player);
  if (!clan) return tower(player);
  const owned = clan.insurance ?? 0;
  const s = new Screen("insurance", "Insurance Vault");
  s.text("K", spaced(`Clan ${clan.name}`));
  CONFIG.insurance.forEach((t, i) => {
    const look = TIER_LOOK[i] ?? TIER_LOOK[0];
    const state = i < owned - 1 ? "OWN" : i === owned - 1 ? "ACT" : i === owned ? "NEXT" : "LOCK";
    const run = state === "NEXT" ? () => buyTier(player, i) : () => insuranceMenu(player, state === "LOCK" ? `§7Unlock ${CONFIG.insurance[i - 1].name} first.` : undefined);
    s.button("TI", state === "LOCK" ? `§8${t.name}` : `§f${t.name}`, run, { icon: ART(look.safe), states: [state] });
    s.text("TIK", { OWN: "§aOWNED", ACT: "§aACTIVE", NEXT: "§6NEXT UNLOCK", LOCK: "§8LOCKED" }[state]);
    s.text("TIP", `${state === "LOCK" ? "§3" : look.col}${Math.round(t.pct * 100)}%`);
    s.text("TID", state === "ACT" ? "Your current cover." : state === "LOCK" ? `Unlock ${CONFIG.insurance[i - 1]?.name ?? ""} first.` : look.desc);
    s.text("TIB", { OWN: "OWNED", ACT: "ACTIVE", NEXT: `§0BUY · ${fmtMoney(t.price)}`, LOCK: `§8LOCKED · ${fmtMoney(t.price)}` }[state], { states: [state] });
  });
  const claim = (clan.log ?? []).find((e) => e.kind === "raided");
  s.text("LC", msg ?? (claim ? `Raided by ${claim.other} · lost ${fmt(Math.abs(claim.money))}${claim.refund ? ` · §arefunded ${fmt(claim.refund)}` : ""}` : "§8No claims yet"));
  await s.show(player);
}

async function buyTier(player, i) {
  const t = CONFIG.insurance[i];
  if (!(await confirm(player, "Insurance", `Buy ${t.name} insurance for ${fmt(t.price)} from the clan bank?`, "Buy"))) return insuranceMenu(player);
  const r = A.buyInsurance(player);
  return insuranceMenu(player, (r.ok ? "§a" : "§c") + r.msg);
}

// ---------------------------------------------------------------------------
// Raid Log
// ---------------------------------------------------------------------------

const LOG_LOOK = {
  won: { tag: "tW", badge: "§aRAID WON", title: (e) => `We raided ${e.other}` },
  raided: { tag: "tR", badge: "§cRAIDED", title: (e) => `${e.other} raided us` },
  defended: { tag: "tD", badge: "§bDEFENDED", title: (e) => `Held off ${e.other}` },
  failed: { tag: "tF", badge: "§7RAID FAILED", title: (e) => `Raid on ${e.other} failed` },
  backout: { tag: "tF", badge: "§8CALLED OFF", title: (e) => `Called off the raid on ${e.other}` },
};

export async function raidLogMenu(player, filter = "all") {
  const clan = clanOf(player);
  if (!clan) return tower(player);
  const mine = ["won", "failed", "backout"];
  const all = clan.log ?? [];
  const list = all.filter((e) => filter === "all" || (filter === "ours" ? mine.includes(e.kind) : !mine.includes(e.kind)));
  const st = clan.stats ?? {};
  const sum = (kind, f = (e) => e.money) => all.filter((e) => e.kind === kind).reduce((n, e) => n + (f(e) || 0), 0);
  const s = new Screen("raidlog", "Raid Log");
  s.text("K", spaced(`Clan ${clan.name}`));
  s.text("V1", `§a+${fmt(sum("won"))}`);
  s.text("V2", `§c-${fmt(Math.abs(sum("raided")))}`);
  s.text("V3", `§6+${fmt(sum("raided", (e) => e.refund))}`);
  s.text("WL", `§f${st.wins ?? 0}\n§7Wins`);
  s.text("WL", `§f${st.losses ?? 0}\n§7Losses`);
  for (const [id, label] of [["all", "All"], ["ours", "Our raids"], ["theirs", "Raids on us"]])
    s.button("TAB", id === filter ? `§0${label}` : label, () => raidLogMenu(player, id), { states: [id === filter ? "ON" : undefined] });
  if (!list.length) s.text("LOG", "§8Nothing here yet.");
  for (const e of list.slice(0, 7)) {
    const look = LOG_LOOK[e.kind] ?? LOG_LOOK.failed;
    s.text("LOG", `§f${look.title(e)}\n§7${e.detail ?? ""}`, { states: [look.tag] });
    s.text("LOGB", look.badge);
    s.text("LOGA", `${e.money >= 0 ? (e.kind === "defended" ? "§b" : "§a") : "§c"}${signed(e.money)}`);
    s.text("LOGT", ago(e.t));
  }
  await s.show(player);
}

// ---------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------

const BOARD_ICON = { wins: CB.raids, streak: CB.insurance, richest: CB.bank, core: CB.core };
const bannerOf = (clan) => BANNER([...clan.id].reduce((n, c) => n + c.charCodeAt(0), 0));

export async function leaderboardsMenu(player, id = "wins") {
  const own = clanOf(player);
  const rows = A.board(id);
  const s = new Screen("boards", "Leaderboards");
  const SHORT = { wins: "Raid Wins", streak: "Defence", richest: "Richest", core: "Core Level" };
  for (const b of A.BOARDS) s.button("TAB", b.id === id ? `§0${SHORT[b.id] ?? b.name}` : SHORT[b.id] ?? b.name, () => leaderboardsMenu(player, b.id), { icon: BOARD_ICON[b.id], states: [b.id === id ? "ON" : undefined] });
  const short = (r) => (id === "wins" ? `${r.v} wins` : r.text);
  rows.slice(0, 3).forEach((r, i) => s.text(`P${i + 1}`, `§f${r.clan.name}\n§7${short(r)}`, { icon: bannerOf(r.clan) }));
  rows.slice(3, 10).forEach((r, i) => {
    s.text("RK", r.clan.name, { icon: bannerOf(r.clan) });
    s.text("RKR", `#${i + 4}`);
    s.text("RKW", id === "wins" ? `${r.clan.stats?.wins ?? 0} W · ${r.clan.stats?.losses ?? 0} L` : "");
    s.text("RKS", id === "richest" ? fmtMoney(r.v) : String(r.v));
  });
  if (!rows.length) s.text("NONE", "No clans yet.");
  if (own) {
    const rank = rows.findIndex((r) => r.clan.id === own.id);
    const r = rows[rank];
    s.text("ME", `§f${own.name} §7· your clan`, { icon: bannerOf(own) });
    s.text("MER", `#${rank + 1}`);
    s.text("MEW", id === "wins" ? `${own.stats?.wins ?? 0} W · ${own.stats?.losses ?? 0} L` : "");
    s.text("MES", r ? (id === "richest" ? fmtMoney(r.v) : String(r.v)) : "0");
  }
  await s.show(player);
}
