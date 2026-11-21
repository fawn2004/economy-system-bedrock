import { system, world } from "@minecraft/server";
import { backTile, success, tileMenu } from "./ui.js";

// ============================================================================
//  PLAYER SETTINGS  (main menu > Player Settings)
//  Per-player preferences, saved on the player:
//    eco:pref:chunks  - show chunk borders (particles only that player sees)
//    eco:pref:xpbar   - show "+XP" skill popups on the action bar
// ============================================================================

export const pref = (player, id, def) => {
  const v = player.getDynamicProperty(`eco:pref:${id}`);
  return typeof v === "boolean" ? v : def;
};
const setPref = (player, id, v) => player.setDynamicProperty(`eco:pref:${id}`, v);

const SETTINGS = [
  { id: "chunks", name: "CHUNK BORDERS", label: "Chunk Borders", desc: "Glowing lines around the chunk you're in", def: false, icon: "textures/blocks/glass" },
  { id: "xpbar", name: "XP POPUPS", label: "XP Popups", desc: '"+3 Mining XP" on the action bar', def: true, icon: "textures/items/experience_bottle" },
];

export async function playerSettingsMenu(player, back, msg) {
  const reopen = (m) => playerSettingsMenu(player, back, m);
  const tiles = SETTINGS.map((s) => {
    const on = pref(player, s.id, s.def);
    return {
      text: `${on ? "§a" : "§c"}§l${s.name}`,
      sub: on ? "§aON §7- tap to turn off" : "§cOFF §7- tap to turn on",
      icon: s.icon,
      onClick: () => {
        setPref(player, s.id, !on);
        success(player, `${s.label} turned ${!on ? "on" : "off"}.`);
        return reopen(`§f${s.name} §7is now ${!on ? "§aON" : "§cOFF"}`);
      },
    };
  });
  tiles.push(backTile(back));
  await tileMenu(player, {
    title: "PLAYER SETTINGS",
    theme: "blue",
    body:
      (msg ? msg + "\n" : "") +
      SETTINGS.map((s) => `§f${s.label}: ${pref(player, s.id, s.def) ? "§aON" : "§cOFF"} §8- ${s.desc}`).join("\n"),
    tiles,
  });
}

// ---- chunk borders ------------------------------------------------------------
const lastChunk = new Map(); // player id -> "cx,cz"

function drawBorders(player) {
  const l = player.location;
  const cx = Math.floor(l.x / 16), cz = Math.floor(l.z / 16);
  const key = `${cx},${cz}`;
  if (lastChunk.get(player.id) !== key) {
    lastChunk.set(player.id, key);
    try {
      player.onScreenDisplay.setActionBar(`§bChunk §f${cx}§7, §f${cz}`);
    } catch {}
  }
  const x0 = cx * 16, z0 = cz * 16, x1 = x0 + 16, z1 = z0 + 16;
  const y = Math.floor(l.y);
  const show = (x, yy, z) => {
    try {
      player.spawnParticle("minecraft:endrod", { x, y: yy, z });
    } catch {}
  };
  // edges at the player's height (two rows)
  for (const yy of [y + 0.1, y + 1.6]) {
    for (let i = 0; i <= 16; i += 1) {
      show(x0 + i, yy, z0);
      show(x0 + i, yy, z1);
      show(x0, yy, z0 + i);
      show(x1, yy, z0 + i);
    }
  }
  // tall corner posts
  for (let dy = -6; dy <= 8; dy += 1) {
    show(x0, y + dy, z0);
    show(x1, y + dy, z0);
    show(x0, y + dy, z1);
    show(x1, y + dy, z1);
  }
}

export function registerPlayerSettings() {
  world.afterEvents.worldLoad.subscribe(() => {
    system.runInterval(() => {
      for (const p of world.getAllPlayers()) {
        try {
          if (pref(p, "chunks", false)) drawBorders(p);
        } catch {}
      }
    }, 15);
  });
}
