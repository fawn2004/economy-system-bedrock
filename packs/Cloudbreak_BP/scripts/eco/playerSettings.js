import { system, world } from "@minecraft/server";
import { success } from "./ui.js";
import { Screen } from "../screens.js";

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

const CBI = "textures/ui/cb/icon_";
const SETTINGS = [
  { id: "chunks", label: "Chunk Borders", desc: "Outline the chunk you are standing in. Only you see it.", def: false, icon: CBI + "grid", col: "cCYAN", on: "§bON" },
  { id: "fullbright", label: "Full Bright", desc: "See clearly at night without torches or particles.", def: false, icon: CBI + "sun", col: "cGOLD", on: "§6ON" },
  { id: "raidsound", label: "Raid Alert Sound", desc: "Play a warning sound when raiders start bridging.", def: true, icon: CBI + "bell", col: "cRED", on: "§cON" },
  { id: "coords", label: "Coordinates", desc: "Show X / Y / Z and facing on the action bar.", def: false, icon: CBI + "compass", col: "cPURPLE", on: "§dON" },
];
export const PLAYER_SETTINGS = SETTINGS;
export const setPlayerPref = (player, id, v) => setPref(player, id, v);
export const settingsOnCount = (player) => SETTINGS.filter((s) => pref(player, s.id, s.def)).length;

/** Settings: Levers. Tap a card to pull its lever. (back is kept for callers; the X closes it.) */
export async function playerSettingsMenu(player, back, msg) {
  const s = new Screen("settings", "Settings");
  for (const st of SETTINGS) {
    const on = pref(player, st.id, st.def);
    s.button("SET", `§f${st.label}\n§7${st.desc}\n${on ? st.on : "§8OFF"}`, () => {
      setPref(player, st.id, !on);
      if (st.id === "fullbright" && on) {
        try {
          player.removeEffect("night_vision");
        } catch {}
      }
      success(player, `${st.label} turned ${!on ? "on" : "off"}.`);
      return playerSettingsMenu(player, back);
    }, { icon: st.icon, states: on ? ["ON", st.col] : [] });
  }
  await s.show(player);
}

// ---- chunk borders ------------------------------------------------------------
const lastChunk = new Map(); // player id -> "cx,cz"

function drawBorders(player) {
  const l = player.location;
  const cx = Math.floor(l.x / 16), cz = Math.floor(l.z / 16);
  const key = `${cx},${cz}`;
  if (lastChunk.get(player.id) !== key) {
    lastChunk.set(player.id, key);
    if (!pref(player, "coords", false)) try {
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

const DIRS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];

function showCoords(player) {
  const l = player.location;
  let facing = "";
  try {
    const yaw = ((player.getRotation().y % 360) + 360) % 360;
    facing = DIRS[Math.round(yaw / 45) % 8];
  } catch {}
  const chunk = pref(player, "chunks", false) ? `   §bChunk §f${Math.floor(l.x / 16)}§7, §f${Math.floor(l.z / 16)}` : "";
  try {
    player.onScreenDisplay.setActionBar(
      `§7X §f${Math.floor(l.x)}  §7Y §f${Math.floor(l.y)}  §7Z §f${Math.floor(l.z)}${facing ? `  §7(${facing})` : ""}${chunk}`
    );
  } catch {}
}

function fullBright(player) {
  try {
    const e = player.getEffect("night_vision");
    if (!e || e.duration < 300) player.addEffect("night_vision", 600, { amplifier: 0, showParticles: false });
  } catch {}
}

export function registerPlayerSettings() {
  world.afterEvents.worldLoad.subscribe(() => {
    system.runInterval(() => {
      for (const p of world.getAllPlayers()) {
        try {
          if (pref(p, "chunks", false)) drawBorders(p);
          if (pref(p, "coords", false)) showCoords(p);
        } catch {}
      }
    }, 15);
    system.runInterval(() => {
      for (const p of world.getAllPlayers()) {
        try {
          if (pref(p, "fullbright", false)) fullBright(p);
        } catch {}
      }
    }, 100);
  });

  // full bright comes back after respawning
  world.afterEvents.playerSpawn.subscribe(({ player }) => {
    system.runTimeout(() => {
      try {
        if (player.isValid && pref(player, "fullbright", false)) fullBright(player);
      } catch {}
    }, 10);
  });
}
