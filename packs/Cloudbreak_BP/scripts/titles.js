import { system } from "@minecraft/server";

// The sidebar uses the title channel, so real titles pause it for a moment.
export const paused = new Map(); // player id -> tick until which a real title shows

/** Call before showing a normal title so the sidebar doesn't replace it. */
export function pauseSidebar(player, ticks = 60) {
  paused.set(player.id, system.currentTick + ticks);
}

/** Shows a real title (pauses the sidebar while it is on screen). */
export function showTitle(player, title, subtitle = "", stay = 60) {
  try {
    pauseSidebar(player, stay + 20);
    player.onScreenDisplay.setTitle(title, { subtitle, fadeInDuration: 5, stayDuration: stay, fadeOutDuration: 10 });
  } catch {}
}
