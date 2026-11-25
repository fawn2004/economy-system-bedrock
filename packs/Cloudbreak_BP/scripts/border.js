import { BlockVolume, system, world } from "@minecraft/server";
import { clanAt } from "./islands.js";
import { loadJson, saveJson } from "./store.js";

// ---------------------------------------------------------------------------
// Visible island border. A patch of see-through red wall (cb:border_x /
// cb:border_z: one flat colour, a single flat face, no shading) appears on the
// border in front of anyone who gets close to it, and is removed when they
// move away. You can walk and build through it (it has no collision and is
// replaceable), so raiders can still bridge in. Only air is ever replaced.
// ---------------------------------------------------------------------------

const NEAR = 10; // show the wall when this close to it (blocks)
const SIDE = 8; // patch reaches this far left/right of you
const BELOW = 5;
const ABOVE = 8;
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
  const y1 = clamp(py - BELOW, -64, 319);
  const y2 = clamp(py + ABOVE, -64, 319);
  const out = [];
  const alongZ = (x) => ({ type: "cb:border_x", from: { x, y: y1, z: clamp(pz - SIDE, minZ, maxZ) }, to: { x, y: y2, z: clamp(pz + SIDE, minZ, maxZ) } });
  const alongX = (z) => ({ type: "cb:border_z", from: { x: clamp(px - SIDE, minX, maxX), y: y1, z }, to: { x: clamp(px + SIDE, minX, maxX), y: y2, z } });
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

export function registerBorder() {
  world.afterEvents.worldLoad.subscribe(() => {
    // patches left over from before a restart: removed as soon as their area is loaded
    pending = loadJson(SAVE_KEY, []);
    system.runInterval(update, 4);
  });
}
