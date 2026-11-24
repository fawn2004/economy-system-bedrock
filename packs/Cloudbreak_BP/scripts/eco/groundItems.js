import { system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

// ============================================================================
//  GROUND ITEM STACKING (less lag)
//  Stackable dropped items close to each other merge into ONE item entity that
//  remembers the real total (e.g. "Rotten Flesh x500"). The entity shows up to
//  a normal stack (64); when that is picked up, the rest pops back out.
//  Items that don't stack (tools, armour, ...) are left alone.
//  A pile still despawns 5 minutes after its oldest item dropped, like vanilla.
// ============================================================================

const TOTAL = "eco:total"; // real number of items in the pile
const VIS = "eco:vis"; // how many the entity showed last time we checked
const BORN = "eco:born"; // when the oldest item in the pile dropped (ms)
const SKIP = "eco:skip"; // removed by this script (merged / cleared)
const DESPAWN_MS = 5 * 60 * 1000 - 5000;
const NEAR_PLAYER = 32; // blocks; further than this a removal is probably a chunk unloading

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const pretty = (id) => id.replace(/^minecraft:/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

function itemOf(e) {
  try {
    return e.getComponent("minecraft:item")?.itemStack;
  } catch {
    return undefined;
  }
}

function read(e) {
  const st = itemOf(e);
  if (!st || st.maxAmount <= 1) return undefined; // doesn't stack - leave it alone
  const vis = num(e.getDynamicProperty(VIS)) ?? st.amount;
  let total = num(e.getDynamicProperty(TOTAL)) ?? st.amount;
  if (st.amount !== vis) total += st.amount - vis; // partly picked up, or vanilla merged into it
  return { e, st, total: Math.max(total, st.amount), born: num(e.getDynamicProperty(BORN)) ?? Date.now() };
}

function write(e, st, total, born) {
  e.setDynamicProperty(TOTAL, total);
  e.setDynamicProperty(VIS, st.amount);
  e.setDynamicProperty(BORN, born);
  const cfg = CONFIG.itemStacking;
  e.nameTag = cfg.showCount && total > 1 ? `§f${st.nameTag ?? pretty(st.typeId)} §ex${commas(total)}` : "";
}

function respawn(dim, loc, st, total, born) {
  const s = st.clone();
  s.amount = Math.min(st.maxAmount, total);
  const e = dim.spawnItem(s, loc);
  try {
    e.clearVelocity();
  } catch {}
  write(e, s, total, born);
  return e;
}

function retire(e) {
  e.setDynamicProperty(SKIP, true);
  e.remove();
}

function tick() {
  const cfg = CONFIG.itemStacking;
  if (!cfg?.enabled) return;
  const r2 = cfg.radius * cfg.radius;
  const dims = new Set(world.getAllPlayers().map((p) => p.dimension.id));
  for (const id of dims) {
    let items;
    try {
      items = world.getDimension(id).getEntities({ type: "minecraft:item" });
    } catch {
      continue;
    }
    const piles = items.map(read).filter(Boolean).sort((a, b) => b.total - a.total);
    const done = new Set();
    for (const a of piles) {
      if (done.has(a)) continue;
      done.add(a);
      let { total, born } = a;
      for (const b of piles) {
        if (done.has(b) || dist2(a.e.location, b.e.location) > r2 || !a.st.isStackableWith(b.st)) continue;
        total += b.total;
        born = Math.min(born, b.born);
        done.add(b);
        try {
          retire(b.e);
        } catch {}
      }
      try {
        if (a.st.amount < Math.min(a.st.maxAmount, total)) {
          const loc = a.e.location, dim = a.e.dimension;
          retire(a.e);
          respawn(dim, loc, a.st, total, born);
        } else write(a.e, a.st, total, born);
      } catch {}
    }
  }
}

/** Removes every dropped item in loaded areas (for lag emergencies). -> count removed */
export function clearGroundItems() {
  let n = 0;
  const dims = new Set(world.getAllPlayers().map((p) => p.dimension.id));
  for (const id of dims) {
    for (const e of world.getDimension(id).getEntities({ type: "minecraft:item" })) {
      try {
        retire(e);
        n++;
      } catch {}
    }
  }
  return n;
}

export function registerGroundItems() {
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(tick, 20));

  // A pile entity was picked up (or burned): pop the rest of the pile back out.
  world.beforeEvents.entityRemove.subscribe(({ removedEntity: e }) => {
    if (e.typeId !== "minecraft:item") return;
    let total, vis, born, st, loc, dimId;
    try {
      if (e.getDynamicProperty(SKIP)) return;
      total = num(e.getDynamicProperty(TOTAL));
      vis = num(e.getDynamicProperty(VIS));
      if (!total || !vis || total <= vis) return;
      born = num(e.getDynamicProperty(BORN)) ?? Date.now();
      st = itemOf(e);
      loc = e.location;
      dimId = e.dimension.id;
    } catch {
      return;
    }
    if (!st || Date.now() - born > DESPAWN_MS) return; // whole pile despawns, like vanilla
    // only when a player is around - otherwise it's just the chunk unloading
    const r2 = NEAR_PLAYER * NEAR_PLAYER;
    if (!world.getAllPlayers().some((p) => p.dimension.id === dimId && dist2(p.location, loc) <= r2)) return;
    const rest = total - vis;
    const copy = st.clone();
    system.run(() => {
      try {
        respawn(world.getDimension(dimId), loc, copy, rest, born);
      } catch {}
    });
  });
}
