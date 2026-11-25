import { BlockVolume, system, world } from "@minecraft/server";
import { clanAt, inBorder, sendHome } from "./islands.js";
import { raidOfPlayer } from "./raids.js";
import { loadJson, saveJson } from "./store.js";

// ---------------------------------------------------------------------------
// Visible, solid island border. A patch of see-through red wall (cb:border_x /
// cb:border_z: one flat colour, a single flat face, no shading) appears on the
// border in front of anyone who gets close to it, and is removed when they
// move away. It runs from the bottom of the world to the top. Players without
// the admin tag can't cross it: they're put back where they were. Raiders in a
// raid may cross into the island they're raiding (and build through it).
// Only air is ever replaced.
// ---------------------------------------------------------------------------

const NEAR = 10; // show the wall when this close to it (blocks)
const SIDE = 12; // patch reaches this far left/right of you
const STEP = 4; // the patch moves in steps of 4 blocks (fewer refills while walking)
const BOTTOM = -64;
const TOP = 319;
const SAVE_KEY = "cb:borderPatches";

let shown = new Map(); // key -> { type, from, to }
let pending = []; // patches that couldn't be removed yet (area not loaded); retried until they are

const key = (w) => `${w.type}|${w.from.x},${w.from.y},${w.from.z}|${w.to.x},${w.to.y},${w.to.z}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const overworld = () => world.getDimension("overworld");

/** The wall patches a player should see right now. */
export function patchesFor(player) {
  if (player.dimension.id !== "minecraft:overworld") return [];
  const loc = player.location;
  const clan = clanAt("minecraft:overworld", loc);
  if (!clan?.island) return [];
  const { x: cx, z: cz, size } = clan.island;
  const half = Math.floor(size / 2);
  // inside blocks run from c-half to c+half; the wall sits in the first block outside
  const minX = cx - half - 1;
  const maxX = cx + half + 1;
  const minZ = cz - half - 1;
  const maxZ = cz + half + 1;
  const px = Math.floor(loc.x);
  const py = Math.floor(loc.y);
  const pz = Math.floor(loc.z);
  const y1 = BOTTOM;
  const y2 = TOP;
  const sx = Math.round(px / STEP) * STEP;
  const sz = Math.round(pz / STEP) * STEP;
  const out = [];
  const alongZ = (x) => ({ type: "cb:border_x", from: { x, y: y1, z: clamp(sz - SIDE, minZ, maxZ) }, to: { x, y: y2, z: clamp(sz + SIDE, minZ, maxZ) } });
  const alongX = (z) => ({ type: "cb:border_z", from: { x: clamp(sx - SIDE, minX, maxX), y: y1, z }, to: { x: clamp(sx + SIDE, minX, maxX), y: y2, z } });
  const nearSpanZ = pz >= minZ - NEAR && pz <= maxZ + NEAR;
  const nearSpanX = px >= minX - NEAR && px <= maxX + NEAR;
  if (nearSpanZ && Math.abs(px - minX) <= NEAR) out.push(alongZ(minX));
  if (nearSpanZ && Math.abs(px - maxX) <= NEAR) out.push(alongZ(maxX));
  if (nearSpanX && Math.abs(pz - minZ) <= NEAR) out.push(alongX(minZ));
  if (nearSpanX && Math.abs(pz - maxZ) <= NEAR) out.push(alongX(maxZ));
  // a patch squeezed to nothing at a corner isn't worth drawing
  return out.filter((w) => w.from.x <= w.to.x && w.from.z <= w.to.z);
}

function fill(w, block, only) {
  try {
    overworld().fillBlocks(new BlockVolume(w.from, w.to), block, { blockFilter: { includeTypes: [only] } });
    return true;
  } catch {
    return false; // area not loaded
  }
}

const remove = (w) => fill(w, "minecraft:air", w.type);

function update() {
  const next = new Map();
  for (const p of world.getAllPlayers()) {
    try {
      for (const w of patchesFor(p)) next.set(key(w), w);
    } catch {}
  }
  let changed = false;
  // remove patches nobody needs any more (only our wall blocks become air)
  for (const [k, w] of shown) {
    if (!next.has(k)) {
      if (!remove(w)) pending.push(w);
      changed = true;
    }
  }
  if (pending.length) {
    const before = pending.length;
    pending = pending.filter((w) => !remove(w));
    if (pending.length !== before) changed = true;
  }
  // draw new patches (only into air), then re-draw the rest in case a removal cut into them
  for (const [k, w] of next) {
    if (!shown.has(k) || changed) fill(w, w.type, "minecraft:air");
    if (!shown.has(k)) changed = true;
  }
  shown = next;
  if (changed) saveJson(SAVE_KEY, [...shown.values(), ...pending].slice(-200));
}

// ---- keeping players inside -------------------------------------------------------
const safe = new Map(); // player id -> last allowed { location, rotation }

/** May this player be at loc? Everyone may be inside a border; admins anywhere;
 *  raiders anywhere in the grid cell of the island they're raiding. */
export function allowedAt(player, loc) {
  if (player.hasTag("admin")) return true;
  if (player.dimension.id !== "minecraft:overworld") return true;
  const clan = clanAt("minecraft:overworld", loc);
  if (!clan?.island) return true; // not near any island
  if (inBorder(clan, loc)) return true;
  const raid = raidOfPlayer(player);
  return !!raid && raid.target === clan.id;
}

function enforce() {
  for (const p of world.getAllPlayers()) {
    try {
      const loc = p.location;
      if (allowedAt(p, loc)) {
        safe.set(p.id, { location: { x: loc.x, y: loc.y, z: loc.z }, rotation: p.getRotation() });
        continue;
      }
      const back = safe.get(p.id);
      if (back) p.teleport(back.location, { rotation: back.rotation, keepVelocity: false });
      else sendHome(p).catch(() => {});
      p.onScreenDisplay.setActionBar("§cYou can't go past the island border.");
    } catch {}
  }
}

export function registerBorder() {
  world.afterEvents.playerLeave.subscribe(({ playerId }) => safe.delete(playerId));
  world.afterEvents.worldLoad.subscribe(() => {
    // patches left over from before a restart: removed as soon as their area is loaded
    pending = loadJson(SAVE_KEY, []);
    system.runInterval(update, 4);
    system.runInterval(enforce, 2);
  });
}
