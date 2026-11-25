// Runs the real menu code against a fake world and prints the form each screen is sent.
import { world, system, mkPlayer, players } from "@minecraft/server";

const scores = new Map();
const obj = { getScore: (p) => scores.get(p.id ?? p) ?? 0, setScore: (p, v) => scores.set(p.id ?? p, v), getScores: () => [], getParticipants: () => [], removeParticipant() {}, hasParticipant: () => true };
world.scoreboard = { getObjective: () => obj, addObjective: () => obj };
world.getAllPlayers = () => world.getPlayers();
world.getDynamicPropertyIds = () => [];
world.sendMessage = () => {};
Object.assign(system, { runInterval: () => 0, clearRun() {}, currentTick: 0, runJob() {} });

function withInventory(p, items = []) {
  const slots = Array(36).fill(undefined);
  items.forEach((it, i) => (slots[i] = it));
  const container = { size: 36, getItem: (i) => slots[i], setItem: (i, v) => (slots[i] = v), addItem: () => undefined, emptySlotsCount: 30 };
  p.getComponent = (id) => (id.includes("inventory") ? { container } : undefined);
  p.selectedSlotIndex = 0;
  p.getGameMode = () => "Survival";
  return p;
}

const fawn = withInventory(mkPlayer("p1", "Fawn", ["admin"]), [{ typeId: "cb:key_raider", amount: 3 }]);
const kai = withInventory(mkPlayer("p2", "Kai_Builds"));
const moss = withInventory(mkPlayer("p3", "Moss"));
const rook = withInventory(mkPlayer("p4", "Rook"));
const ember = withInventory(mkPlayer("p5", "Ember_Jay"));
const frost = withInventory(mkPlayer("p6", "FrostByte", ["admin"]));

const C = await import("./clans.js");
const E = await import("./eco/economy.js");
const make = (owner, name, extra) => {
  const r = C.createClan(owner, name);
  if (!r.ok) throw new Error(r.msg);
  Object.assign(r.clan, { island: { slot: 0, x: 20000, y: 100, z: 20000, size: 150 }, created: Date.now() - 9 * 864e5 }, extra);
  C.saveClan(r.clan);
  return r.clan;
};
const t = (h) => Date.now() - h * 3600000;
const night = make(fawn, "Nightfall", {
  bank: 2412800, insurance: 2, up: { size: 2, sell: 2, fly: 1, ore: 4, spawners: 2, crops: 1 },
  stats: { wins: 12, losses: 3, defences: 4, streak: 5 },
  ledger: [
    { t: t(0.04), what: "Deposit", who: "Fawn", amt: 250000 }, { t: t(0.3), what: "Core tax", who: "Island core", amt: -10000 },
    { t: t(2), what: "Raided by Embercrest", who: "Raid", amt: -84000 }, { t: t(5), what: "Raid won vs Frostpeak", who: "Raid", amt: 212000 },
    { t: t(6), what: "Withdraw", who: "Kai_Builds", amt: -40000 }, { t: t(8), what: "Deposit", who: "Moss", amt: 60000 },
    { t: t(9), what: "Core tax", who: "Island core", amt: -10000 }, { t: t(9.5), what: "Raid bought (Intel)", who: "Fawn", amt: -45000 },
  ],
  log: [
    { t: t(2), kind: "raided", other: "Embercrest", money: -84000, detail: "4 raiders · insurance paid $21,000", refund: 21000 },
    { t: t(5), kind: "won", other: "Frostpeak", money: 212000, detail: "Intel raid · 5 raiders" },
    { t: t(9), kind: "defended", other: "Ravenhold", money: 30000, detail: "Raiders ran out of time" },
    { t: t(26), kind: "failed", other: "Mosswood", money: -30000, detail: "All raiders lost their lives" },
    { t: t(30), kind: "won", other: "Dunecrown", money: 96400, detail: "Cheap raid · shields were down" },
    { t: t(50), kind: "defended", other: "Embercrest", money: 45000, detail: "Defenders knocked the bridge down" },
  ],
  revenge: { clanId: "x", until: Date.now() + 3600000 },
});
C.invitePlayer(fawn, kai); C.acceptInvite(kai); C.promoteMember(fawn, kai.id);
C.invitePlayer(fawn, moss); C.acceptInvite(moss);
C.invitePlayer(fawn, rook); C.acceptInvite(rook);
const ec = make(ember, "Embercrest", { bank: 900000, stats: { wins: 58, losses: 9 } });
make(frost, "Frostpeak", { bank: 600000, stats: { wins: 41, losses: 12 } });
const more = [["Ravenhold", 33, 8], ["Dunecrown", 29, 11], ["Mosswood", 25, 6], ["Ironveil", 22, 14], ["Starfall", 19, 4], ["Cinderbay", 17, 9], ["Tidecall", 15, 7], ["Hollowpine", 14, 12]];
more.forEach(([n, w, l], i) => make(withInventory(mkPlayer("x" + i, n + "_o")), n, { stats: { wins: w, losses: l } }));
E.setBalance(fawn, 184250); E.setBalance(kai, 96400);
night.revenge = { clanId: ec.id, until: Date.now() + 3600000 };
C.saveClan(night);

const { Screen } = await import("./screens.js");
const out = {};
async function grab(name, fn) {
  Screen.last = undefined;
  try {
    await fn();
  } catch (e) {
    console.error(`[${name}] ${e.stack}`);
  }
  const s = Screen.last;
  if (!s) return console.error(`[${name}] no screen`);
  const f = s.form();
  out[`${s.id}:${name}`] = { title: f._title, buttons: f._buttons };
}
const M = await import("./menus.js");
const AD = await import("./admin.js");
const CR = await import("./crates.js");
const PS = await import("./eco/playerSettings.js");
const SH = await import("./eco/menus.js");
await grab("main", () => M.tower(fawn));
await grab("members", () => M.membersMenu(fawn, moss.id));
await grab("bank", () => M.bankMenu(fawn));
await grab("core", () => M.coreTerminal(fawn));
await grab("dispatch", () => M.raidMenu(fawn));
await grab("insurance", () => M.insuranceMenu(fawn));
await grab("log", () => M.raidLogMenu(fawn));
await grab("wins", () => M.leaderboardsMenu(fawn));
await grab("levers", () => PS.playerSettingsMenu(fawn, () => {}));
await grab("bridging", () => SH.skyShopMenu(fawn));
await grab("normal", () => AD.adminPanel(fawn, { targetId: kai.id, cat: "keys", opt: "raider", n: 5 }));
await grab("admin", () => AD.adminPanel(fawn, { targetId: frost.id, cat: "money" }));
const RAR = CR.CRATE_REWARDS.raider;
await grab("won", () => CR.crateScreen(fawn, "raider", RAR.find((w) => w.r === "rare")));
await grab("spin", () => CR.crateScreen(fawn, "raider", RAR.find((w) => w.r === "epic"), true));
// the grid zone's items must come first (cell i shows form button i)
const { LAYOUT } = await import("./screen_layout.js");
let bad = 0;
for (const [key, f] of Object.entries(out)) {
  const L = LAYOUT[key.split(":")[0]];
  if (!L.grid) continue;
  const tags = f.buttons.map((b) => b.text.match(/^\[([A-Z0-9_]+)\]/)?.[1]);
  const n = tags.filter((t) => t === L.grid).length;
  if (tags.slice(0, n).some((t) => t !== L.grid)) { bad++; console.error(`${key}: grid items aren't first`); }
  if (n > L.gridSize) { bad++; console.error(`${key}: ${n} grid items but only ${L.gridSize} cells`); }
}
console.error(bad ? `LAYOUT CHECK FAILED (${bad})` : "layout check ok");
console.log(JSON.stringify(out));
