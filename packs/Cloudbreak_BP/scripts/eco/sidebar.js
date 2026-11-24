import { system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { fmtMoney, getBalance, rankOf } from "./economy.js";
import { pref } from "./playerSettings.js";
import { allHeadPoints, ownedSpawnerCount } from "./spawners.js";

// ============================================================================
//  SIDEBAR  (the scoreboard-style panel on the right of the screen)
//  Each player gets their own: it's sent as a title starting with MARK, and
//  the resource pack (ui/hud_screen.json) draws titles with that marker as the
//  sidebar instead of a big title. Players can hide it in Player Settings,
//  admins can change the title / footer or turn it off (Admin > Settings).
// ============================================================================

export const SIDEBAR_MARK = "§e§s§b§r";
const REFRESH = 40; // ticks (2 seconds)
const paused = new Map(); // player id -> tick until which real titles are showing

/** Call before showing a normal title so the sidebar doesn't cover it. */
export function pauseSidebar(player, ticks = 60) {
  paused.set(player.id, system.currentTick + ticks);
}

export function clearSidebar(player) {
  try {
    player.runCommand("title @s clear");
  } catch {}
}

function lines(player, online) {
  const rank = rankOf(player);
  const heads = allHeadPoints(player).reduce((n, h) => n + h.points, 0);
  const bar = "§8- - - - - - - - - - - -";
  const out = [
    CONFIG.sidebar.title,
    bar,
    `§f${player.name}`,
    "",
    `§7Balance: §a${fmtMoney(getBalance(player))}`,
    `§7Rank: §6${rank ? "#" + rank : "-"}`,
    `§7Heads: §d${String(heads).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
    `§7Spawners: §b${ownedSpawnerCount(player.id)}`,
    "",
    `§7Online: §f${online}`,
    bar,
  ];
  if (CONFIG.sidebar.footer) out.push(CONFIG.sidebar.footer);
  return out.join("\n");
}

function refresh() {
  const players = world.getAllPlayers();
  const now = system.currentTick;
  for (const p of players) {
    try {
      if (!CONFIG.sidebar.enabled || !pref(p, "sidebar", true)) continue;
      if ((paused.get(p.id) ?? 0) > now) continue;
      p.onScreenDisplay.setTitle(SIDEBAR_MARK + lines(p, players.length), {
        fadeInDuration: 0,
        stayDuration: REFRESH * 3,
        fadeOutDuration: 0,
      });
    } catch {}
  }
}

export function registerSidebar() {
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(refresh, REFRESH));
  world.beforeEvents.playerLeave.subscribe(({ player }) => paused.delete(player.id));
}
