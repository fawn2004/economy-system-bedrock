import { system, world } from "@minecraft/server";

// ============================================================================
//  SHOP NPCs
//  Big shopkeepers (1.4x a player) that players tap instead of using the
//  compass. Three kinds: Shop, Sell and Menu. Admins spawn / remove them in
//  Admin > NPCs. They're invincible, can't be pushed and turn to face the
//  nearest player.
// ============================================================================

const NPC = "eco:npc";
export const NPC_TYPES = {
  shop: { name: "§6§lSHOP", sub: "§7Tap to buy", skin: 0 },
  sell: { name: "§a§lSELL", sub: "§7Tap to sell", skin: 1 },
  menu: { name: "§b§lMENU", sub: "§7Tap to open", skin: 2 },
};

let openers = {}; // type -> (player) => opens that menu (set by menus.js)
export const setNpcOpeners = (o) => (openers = o);

export function spawnNpc(player, type) {
  const t = NPC_TYPES[type] ?? NPC_TYPES.shop;
  const l = player.location;
  const at = { x: Math.floor(l.x) + 0.5, y: Math.floor(l.y), z: Math.floor(l.z) + 0.5 };
  const e = player.dimension.spawnEntity(NPC, at);
  try {
    e.triggerEvent(`eco:set_npc_${t.skin}`);
  } catch {}
  e.setDynamicProperty("eco:npc", type);
  e.nameTag = `${t.name}\n${t.sub}`;
  try {
    e.setRotation({ x: 0, y: (player.getRotation().y + 180) % 360 });
  } catch {}
  return e;
}

/** Removes the nearest NPC within 6 blocks. -> true if one was removed */
export function removeNearestNpc(player) {
  const list = player.dimension.getEntities({ type: NPC, location: player.location, maxDistance: 6 });
  if (!list.length) return false;
  const d2 = (e) => (e.location.x - player.location.x) ** 2 + (e.location.y - player.location.y) ** 2 + (e.location.z - player.location.z) ** 2;
  list.sort((a, b) => d2(a) - d2(b))[0].remove();
  return true;
}

function lookAtPlayers() {
  const players = world.getAllPlayers();
  const dims = new Set(players.map((p) => p.dimension.id));
  for (const id of dims) {
    let npcs;
    try {
      npcs = world.getDimension(id).getEntities({ type: NPC });
    } catch {
      continue;
    }
    for (const e of npcs) {
      let best, bestD = 10 * 10;
      for (const p of players) {
        if (p.dimension.id !== id) continue;
        const d = (p.location.x - e.location.x) ** 2 + (p.location.z - e.location.z) ** 2;
        if (d < bestD) {
          best = p;
          bestD = d;
        }
      }
      if (!best) continue;
      const dx = best.location.x - e.location.x, dz = best.location.z - e.location.z;
      try {
        e.setRotation({ x: 0, y: (Math.atan2(-dx, dz) * 180) / Math.PI });
      } catch {}
    }
  }
}

export function registerNpcs() {
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(lookAtPlayers, 10));
  world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
    if (target.typeId !== NPC) return;
    let type = "shop";
    try {
      type = String(target.getDynamicProperty("eco:npc") ?? "shop");
    } catch {}
    const open = openers[type] ?? openers.shop;
    if (open) Promise.resolve(open(player)).catch((e) => console.warn("[eco] npc: " + e));
  });
}
