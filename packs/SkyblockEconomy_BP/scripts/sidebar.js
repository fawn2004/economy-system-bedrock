import { system, world } from "@minecraft/server";
import { getBank } from "./bank.js";
import { CONFIG } from "./config.js";
import { dungeonObjective, inDungeon } from "./dungeons.js";
import { getBalance } from "./economy.js";
import { commissionObjective } from "./extras.js";
import { pref } from "./playerSettings.js";
import { slayerObjective } from "./slayer.js";

// ============================================================================
//  SIDEBAR  (scoreboard-style panel on the right of the screen)
//  Each player gets their own. It's sent as a title + subtitle: the title
//  starts with MARK and holds the sidebar's heading, the subtitle holds the
//  lines. The resource pack (ui/hud_screen.json) draws titles with that marker
//  as the sidebar instead of a big title. Players can switch to a compact one in Settings,
//  admins can change the heading / footer or turn it off (Admin > Settings).
//
//  Lines: date, in-game season / day / time, location, purse, bank, your
//  current objective (slayer quest, dungeon run or a daily commission), footer.
// ============================================================================

export const SIDEBAR_MARK = "§e§s§b§r";
const REFRESH = 20; // ticks (1 second)
const paused = new Map(); // player id -> tick until which real titles are showing

/** Call before showing a normal title so the sidebar doesn't cover it. */
export function pauseSidebar(player, ticks = 60) {
  paused.set(player.id, system.currentTick + ticks);
}

const shown = new Set(); // players whose sidebar is currently on screen

/**
 * Hides the sidebar. "title clear" alone isn't enough: the screen keeps the last
 * title text (which is what draws the sidebar), so it's replaced by an empty title.
 */
export function clearSidebar(player) {
  shown.delete(player.id);
  try {
    player.onScreenDisplay.setTitle("§r", { subtitle: "§r", fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 });
  } catch {}
  try {
    player.runCommand("title @s clear");
  } catch {}
}

const SEASONS = ["Early Spring", "Spring", "Late Spring", "Early Summer", "Summer", "Late Summer", "Early Autumn", "Autumn", "Late Autumn", "Early Winter", "Winter", "Late Winter"];
const DAYS_PER_SEASON = 31;
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");
const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
function coins(n) {
  if (n >= 1e12) return (Math.floor(n / 1e10) / 100) + "T";
  return commas(n);
}

function calendar() {
  let day = 0, ticks = 6000;
  try {
    day = world.getDay();
    ticks = world.getTimeOfDay();
  } catch {}
  const d = day % (SEASONS.length * DAYS_PER_SEASON);
  const season = SEASONS[Math.floor(d / DAYS_PER_SEASON)];
  const hours24 = (Math.floor(ticks / 1000) + 6) % 24;
  const minutes = Math.floor(((ticks % 1000) / 1000) * 6) * 10; // steps of 10 minutes
  const h12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const night = hours24 >= 19 || hours24 < 6;
  return {
    date: ` ${season} ${ordinal((d % DAYS_PER_SEASON) + 1)}`,
    time: ` §7${h12}:${String(minutes).padStart(2, "0")}${hours24 < 12 ? "am" : "pm"} ${night ? "§b☽" : "§e☀"}`,
  };
}

function location(player) {
  if (inDungeon(player)) return "§cThe Crypts";
  const id = player.dimension.id;
  if (id.includes("nether")) return "§cThe Nether";
  if (id.includes("end")) return "§dThe End";
  return "§bYour Island";
}

function lines(player, compact) {
  const now = new Date();
  const date = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${String(now.getFullYear()).slice(2)}`;
  if (compact) {
    // compact sidebar (Player Settings > Sidebar): just the essentials
    const small = [`§7${date} §7${world.getAllPlayers().length} online`, "", `Purse: §6${coins(getBalance(player))}`, `Bank: §6${coins(getBank(player))}`];
    if (CONFIG.sidebar.footer) small.push("", CONFIG.sidebar.footer);
    return small.join("\n");
  }
  const cal = calendar();
  const out = [
    `§7${date} §7${world.getAllPlayers().length} online`,
    "",
    cal.date,
    cal.time,
    ` §7⏣ ${location(player)}`,
    "",
    `Purse: §6${coins(getBalance(player))}`,
    `Bank: §6${coins(getBank(player))}`,
    "",
  ];
  let obj;
  try {
    obj = dungeonObjective(player) ?? slayerObjective(player) ?? commissionObjective(player);
  } catch {}
  if (obj) out.push(...obj, "");
  if (CONFIG.sidebar.footer) out.push(CONFIG.sidebar.footer);
  return out.join("\n");
}

function refresh() {
  const now = system.currentTick;
  for (const p of world.getAllPlayers()) {
    try {
      if (!CONFIG.sidebar.enabled) {
        if (shown.has(p.id)) clearSidebar(p);
        continue;
      }
      if ((paused.get(p.id) ?? 0) > now) continue;
      shown.add(p.id);
      p.onScreenDisplay.setTitle(SIDEBAR_MARK + CONFIG.sidebar.title, {
        subtitle: lines(p, !pref(p, "sidebar", true)),
        fadeInDuration: 0,
        stayDuration: REFRESH * 3,
        fadeOutDuration: 0,
      });
    } catch {}
  }
}

export function registerSidebar() {
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(refresh, REFRESH));
  world.beforeEvents.playerLeave.subscribe(({ player }) => {
    paused.delete(player.id);
    shown.delete(player.id);
  });
}
