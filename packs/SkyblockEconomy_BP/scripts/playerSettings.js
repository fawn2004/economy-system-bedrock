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
  { id: "sidebar", name: "SIDEBAR", label: "Sidebar", desc: "Full, or compact (just date, players, purse & bank)", def: true, icon: "textures/items/paper", onText: "FULL", offText: "COMPACT" },
  { id: "chunks", name: "CHUNK BORDERS", label: "Chunk Borders", desc: "Glowing lines around the chunk you're in", def: false, icon: "textures/blocks/glass" },
  { id: "fullbright", name: "FULL BRIGHT", label: "Full Bright", desc: "See clearly in the dark", def: false, icon: "textures/items/potion_bottle_nightVision" },
  { id: "coords", name: "COORDINATES", label: "Coordinates", desc: "Your X / Y / Z on the action bar", def: false, icon: "textures/items/compass_item" },
  { id: "deathpos", name: "DEATH LOCATION", label: "Death Location", desc: "Tells you where you died", def: true, icon: "textures/items/bone" },
  { id: "xpbar", name: "XP POPUPS", label: "XP Popups", desc: '"+3 Mining XP" on the action bar', def: true, icon: "textures/items/experience_bottle" },
  { id: "titles", name: "LEVEL-UP TITLES", label: "Level-up Titles", desc: 'Big "Mining 5" title on screen', def: true, icon: "textures/items/book_enchanted" },
];

export async function playerSettingsMenu(player, back, msg) {
  const reopen = (m) => playerSettingsMenu(player, back, m);
  const tiles = SETTINGS.map((s) => {
    const on = pref(player, s.id, s.def);
    return {
      text: `${on ? "§a" : s.offText ? "§e" : "§c"}§l${s.name}`,
      sub: s.onText
        ? on ? `§a${s.onText} §7- tap for ${s.offText.toLowerCase()}` : `§e${s.offText} §7- tap for ${s.onText.toLowerCase()}`
        : on ? "§aON §7- tap to turn off" : "§cOFF §7- tap to turn on",
      icon: s.icon,
      onClick: () => {
        setPref(player, s.id, !on);
        if (s.id === "fullbright" && on) {
          try {
            player.removeEffect("night_vision");
          } catch {}
        }
        const state = s.onText ? (!on ? s.onText : s.offText).toLowerCase() : !on ? "on" : "off";
        success(player, s.onText ? `${s.label} is now ${state}.` : `${s.label} turned ${state}.`);
        return reopen(`§f${s.name} §7is now §a${state.toUpperCase()}`);
      },
    };
  });
  tiles.push(backTile(back));
  await tileMenu(player, {
    title: "PLAYER SETTINGS",
    theme: "blue",
    body:
      (msg ? msg + "\n" : "") +
      SETTINGS.map((s) => {
        const on = pref(player, s.id, s.def);
        const v = s.onText ? (on ? `§a${s.onText}` : `§e${s.offText}`) : on ? "§aON" : "§cOFF";
        return `§f${s.label}: ${v} §8- ${s.desc}`;
      }).join("\n"),
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

  // death location message
  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (deadEntity.typeId !== "minecraft:player") return;
    try {
      if (!pref(deadEntity, "deathpos", true)) return;
      const l = deadEntity.location;
      const dim = deadEntity.dimension.id.replace("minecraft:", "").replace("_", " ");
      deadEntity.sendMessage(`§c§lYou died §r§7at §fX ${Math.floor(l.x)} §7Y §f${Math.floor(l.y)} §7Z §f${Math.floor(l.z)} §8(${dim})`);
    } catch {}
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
