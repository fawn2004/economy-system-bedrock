import { BlockPermutation, ItemStack, system, world } from "@minecraft/server";
import { sellPrice } from "./catalog.js";
import { CHUNK_HOPPER as CH, CONFIG } from "./config.js";
import { addMoney, fmt, getBalance, sellMultiplier, takeMoney } from "./economy.js";
import { addHeadPoints, headMob, mobName } from "./spawners.js";
import { addCropPoints, cropName, enchantedCrop } from "./tools.js";
import { addHeadsCollected } from "./leaderboards.js";
import { ICON, backTile, fail, success, tileMenu } from "./ui.js";
import { isAdmin } from "../admin_check.js";

// ============================================================================
//  CHUNK HOPPER
//  A locked vanilla hopper (so it never moves items itself) that sucks up every
//  plain dropped item in its 16x16 chunk into its own storage. Tap it for the
//  menu: sell all, collect all, upgrade storage, pick up.
//  Saved per hopper:  eco:ch:<dim>:<x>,<y>,<z> = { owner, ownerName, level, store }
// ============================================================================

const ITEM = "eco:chunk_hopper";
const TAG = "§8eco:chunkhopper:";
const KEY = "eco:ch:";
const hoppers = new Map(); // key -> data (+ dim, x, y, z)

const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const titleCase = (id) => id.replace(/^(minecraft|eco):/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const pretty = (id) =>
  headMob(id) ? `${mobName(headMob(id))} Head` : enchantedCrop(id) ? `Enchanted ${cropName(enchantedCrop(id))}` : titleCase(id);
const keyOf = (dimId, l) => `${KEY}${dimId}:${l.x},${l.y},${l.z}`;
const chunkOf = (l) => `${Math.floor(l.x / 16)},${Math.floor(l.z / 16)}`;
const canManage = (p, d) => !d.owner || d.owner === p.id || isAdmin(p);
export const capacityOf = (d) => CH.baseStorage + (d.level ?? 0) * CH.storagePerLevel;
const stored = (d) => Object.values(d.store ?? {}).reduce((a, b) => a + b, 0);
const maxLevel = () => CH.upgradeCosts.length;
const maxSpeed = () => Math.min(CH.speedCosts?.length ?? 0, (CH.speedIntervals?.length ?? 1) - 1);
export const intervalOf = (d) => {
  const list = CH.speedIntervals?.length ? CH.speedIntervals : [1];
  return list[Math.min(d.speed ?? 0, list.length - 1)];
};
const nextRun = new Map(); // key -> tick of the next sweep

function parseKey(key) {
  const rest = key.slice(KEY.length);
  const i = rest.lastIndexOf(":");
  const [x, y, z] = rest.slice(i + 1).split(",").map(Number);
  return { dim: rest.slice(0, i), x, y, z };
}

function save(key, d) {
  hoppers.set(key, d);
  world.setDynamicProperty(
    key,
    JSON.stringify({ owner: d.owner, ownerName: d.ownerName, level: d.level ?? 0, speed: d.speed ?? 0, store: d.store ?? {} })
  );
}

function forget(key) {
  hoppers.delete(key);
  world.setDynamicProperty(key, undefined);
}

function loadAll() {
  hoppers.clear();
  for (const k of world.getDynamicPropertyIds()) {
    if (!k.startsWith(KEY)) continue;
    try {
      hoppers.set(k, { ...JSON.parse(String(world.getDynamicProperty(k))), ...parseKey(k) });
    } catch {}
  }
}

// ---- item ------------------------------------------------------------------------
export function makeHopperItem(level = 0, speed = 0) {
  const s = new ItemStack(ITEM, 1);
  const tags = [level ? `Storage ${level}` : "", speed ? `Speed ${speed}` : ""].filter(Boolean).join(", ");
  s.nameTag = `§r§6Chunk Hopper${tags ? ` §7[${tags}]` : ""}`;
  s.setLore([
    "§7Collects every dropped item",
    "§7in its chunk. Tap it to sell,",
    "§7collect or upgrade. One per chunk.",
    `§7Storage: §f${commas(CH.baseStorage + level * CH.storagePerLevel)} items`,
    `§7Collects every §f${intervalOf({ speed })}s`,
    `${TAG}${level}:${speed}`,
  ]);
  return s;
}

function levelFromItem(item) {
  if (item?.typeId !== ITEM) return undefined;
  const line = item.getLore().find((l) => l.startsWith(TAG));
  if (!line) return { level: 0, speed: 0 };
  const [level, speed] = line.slice(TAG.length).split(":");
  return { level: Math.max(0, Number(level) || 0), speed: Math.max(0, Number(speed) || 0) };
}

// ---- placing / protection -------------------------------------------------------
const FACE = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] };

function place(player, block, face, info) {
  const [ox, oy, oz] = FACE[face] ?? FACE.Up;
  const dim = player.dimension;
  const at = { x: block.x + ox, y: block.y + oy, z: block.z + oz };
  let target;
  try {
    target = dim.getBlock(at);
  } catch {
    return;
  }
  if (!target?.isAir) return fail(player, "There's no room there.");
  const chunk = chunkOf(at);
  for (const d of hoppers.values()) {
    if (d.dim === dim.id && chunkOf(d) === chunk) return fail(player, "This chunk already has a Chunk Hopper.");
  }
  try {
    target.setPermutation(BlockPermutation.resolve("minecraft:hopper", { facing_direction: 0, toggle_bit: true }));
  } catch {
    target.setType("minecraft:hopper");
  }
  save(keyOf(dim.id, at), { owner: player.id, ownerName: player.name, level: info.level, speed: info.speed, store: {}, dim: dim.id, ...at });
  if (String(player.getGameMode()).toLowerCase() !== "creative") {
    player.getComponent("minecraft:inventory").container.setItem(player.selectedSlotIndex, undefined);
  }
  player.playSound("random.anvil_land", { volume: 0.5 });
  success(player, "Chunk Hopper placed! It collects every dropped item in this chunk. Tap it to open it.");
}

// ---- collecting --------------------------------------------------------------------
function isPlain(st) {
  if (st.nameTag || st.getLore().length) return false;
  try {
    if (st.getComponent("minecraft:enchantable")?.getEnchantments().length) return false;
  } catch {}
  return true;
}

function tick() {
  if (!hoppers.size) return;
  const dims = new Set(world.getAllPlayers().map((p) => p.dimension.id));
  const now = system.currentTick;
  for (const [key, d] of hoppers) {
    if (!dims.has(d.dim)) continue;
    if ((nextRun.get(key) ?? 0) > now) continue;
    nextRun.set(key, now + Math.max(5, Math.round(intervalOf(d) * 20)));
    let dim, block;
    try {
      dim = world.getDimension(d.dim);
      block = dim.getBlock(d);
    } catch {
      continue; // chunk not loaded
    }
    if (!block) continue;
    if (block.typeId !== "minecraft:hopper") {
      forget(key); // removed by a command etc.
      continue;
    }
    const cap = capacityOf(d);
    let total = stored(d);
    if (total >= cap) continue;
    const cx = Math.floor(d.x / 16) * 16, cz = Math.floor(d.z / 16) * 16;
    let items;
    try {
      items = dim.getEntities({ type: "minecraft:item", location: { x: cx, y: -64, z: cz }, volume: { x: 16, y: 384, z: 16 } });
    } catch {
      continue;
    }
    let changed = false;
    for (const e of items) {
      if (total >= cap) break;
      try {
        const st = e.getComponent("minecraft:item")?.itemStack;
        if (!st || !isPlain(st)) continue;
        // floor-item piles hold more than they show
        const pile = Number(e.getDynamicProperty("eco:total") ?? st.amount);
        const take = Math.min(pile, cap - total);
        d.store = d.store ?? {};
        d.store[st.typeId] = (d.store[st.typeId] ?? 0) + take;
        total += take;
        changed = true;
        if (take >= pile) {
          e.setDynamicProperty("eco:skip", true); // don't let the pile pop back out
          e.remove();
        } else {
          e.setDynamicProperty("eco:total", pile - take);
        }
      } catch {}
    }
    if (changed) save(key, d);
  }
}

// ---- menu -----------------------------------------------------------------------------
const valueOf = (id) => sellPrice(id);

export async function hopperMenu(player, key, msg) {
  const d = hoppers.get(key);
  if (!d) return;
  const manage = canManage(player, d);
  const total = stored(d), cap = capacityOf(d);
  const worth = Object.entries(d.store ?? {}).reduce((n, [id, c]) => n + valueOf(id) * c, 0);
  const top = Object.entries(d.store ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, c]) => `§f${pretty(id)} §7x${commas(c)}`)
    .join("§7, ");
  const reopen = (m) => hopperMenu(player, key, m);
  const lines = [
    msg,
    `§6Chunk Hopper   §7Owner: §f${d.ownerName ?? "?"}`,
    `§7Storage: ${total >= cap ? "§c" : "§f"}${commas(total)}/${commas(cap)}${total >= cap ? " FULL" : ""}   §7Level: §f${d.level ?? 0}/${maxLevel()}`,
    `§7Collects every §f${intervalOf(d)}s   §7Speed: §f${d.speed ?? 0}/${maxSpeed()}`,
    total ? `§7Holding: ${top}${Object.keys(d.store).length > 6 ? "§7..." : ""}` : "§7Empty - dropped items in this chunk will be collected.",
  ].filter(Boolean);
  const tiles = [];
  if (manage) {
    tiles.push({ text: "§6§lSELL ALL", sub: `§a${fmt(worth)}`, icon: ICON.sell, onClick: () => reopen(sellAll(player, key)) });
    tiles.push({ text: "§a§lCOLLECT ALL", sub: `§7${commas(total)} items`, icon: ICON.shop, onClick: () => reopen(collectAll(player, key)) });
    const lvl = d.level ?? 0;
    tiles.push({
      text: "§b§lUPGRADE STORAGE",
      sub: lvl >= maxLevel() ? "§aMAX" : `${getBalance(player) >= CH.upgradeCosts[lvl] ? "§a" : "§c"}${fmt(CH.upgradeCosts[lvl])}`,
      icon: ICON.top,
      onClick: () => reopen(upgrade(player, key)),
    });
    const spd = d.speed ?? 0;
    tiles.push({
      text: "§e§lUPGRADE SPEED",
      sub: spd >= maxSpeed() ? "§aMAX" : `${getBalance(player) >= CH.speedCosts[spd] ? "§a" : "§c"}${fmt(CH.speedCosts[spd])}`,
      icon: "textures/items/sugar",
      onClick: () => reopen(upgradeSpeed(player, key)),
    });
    tiles.push({
      text: "§c§lPICK UP",
      sub: "§7Keeps upgrades",
      icon: ICON.cancel,
      onClick: () =>
        tileMenu(player, {
          title: "PICK UP HOPPER?",
          theme: "red",
          body: "§7The Chunk Hopper goes back to your inventory with its storage and speed upgrades,\n§7and you get everything it has stored.",
          tiles: [
            { text: "§a§lYES", sub: "§7Pick it up", icon: ICON.confirm, onClick: () => pickUp(player, key) },
            { text: "§c§lNO", sub: "§7Cancel", icon: ICON.cancel, onClick: () => reopen() },
          ],
        }),
    });
  } else lines.push(`§8Only ${d.ownerName ?? "the owner"} can use this Chunk Hopper.`);
  tiles.push({ text: "§7§lCLOSE", sub: "§7Close menu", icon: ICON.back });
  await tileMenu(player, { title: "CHUNK HOPPER", theme: "gold", body: lines.join("\n"), tiles });
}

function sellAll(player, key) {
  const d = hoppers.get(key);
  if (!d || !canManage(player, d)) return "§cThis isn't your Chunk Hopper.";
  let earned = 0, sold = 0, heads = 0, crops = 0;
  for (const [id, count] of Object.entries(d.store ?? {})) {
    const mob = headMob(id), crop = enchantedCrop(id);
    if (mob) {
      addHeadPoints(player, mob, count);
      addHeadsCollected(player, count);
      heads += count;
    } else if (crop) {
      addCropPoints(player, crop, count);
      crops += count;
    } else {
      const price = valueOf(id);
      if (price <= 0) continue;
      earned += price * count;
      sold += count;
    }
    delete d.store[id];
  }
  save(key, d);
  if (!sold && !heads && !crops) return "§7Nothing here can be sold.";
  earned = Math.floor(earned * sellMultiplier(player));
  if (earned) addMoney(player, earned);
  const parts = [];
  if (sold) parts.push(`§f${commas(sold)} §aitems for §f${fmt(earned)}`);
  if (heads) parts.push(`§d${heads} heads §7to your head count`);
  if (crops) parts.push(`§2${crops} enchanted crops §7to your balance`);
  success(player, "Sold: " + parts.join(", ").replace(/§./g, ""));
  return "§aSold " + parts.join("§a, ") + "§a.";
}

function collectAll(player, key) {
  const d = hoppers.get(key);
  if (!d || !canManage(player, d)) return "§cThis isn't your Chunk Hopper.";
  const inv = player.getComponent("minecraft:inventory")?.container;
  let given = 0, full = false;
  for (const [id, count] of Object.entries(d.store ?? {})) {
    let left = count;
    while (left > 0 && !full) {
      let st;
      try {
        st = new ItemStack(id, 1);
      } catch {
        left = 0;
        break;
      }
      st.amount = Math.min(st.maxAmount, left);
      const want = st.amount;
      const over = inv.addItem(st);
      const got = want - (over?.amount ?? 0);
      left -= got;
      given += got;
      if (over) full = true;
    }
    if (left > 0) d.store[id] = left;
    else delete d.store[id];
    if (full) break;
  }
  save(key, d);
  if (!given) return full ? "§cYour inventory is full!" : "§7Nothing to collect.";
  success(player, `Collected ${commas(given)} items.`);
  return full ? `§aCollected §f${commas(given)}§a - §cinventory full, the rest is still stored` : `§aCollected §f${commas(given)} §aitems.`;
}

function upgrade(player, key) {
  const d = hoppers.get(key);
  if (!d || !canManage(player, d)) return "§cThis isn't your Chunk Hopper.";
  const lvl = d.level ?? 0;
  if (lvl >= maxLevel()) return "§aStorage is already maxed.";
  const cost = CH.upgradeCosts[lvl];
  if (!takeMoney(player, cost)) {
    fail(player, `You need ${fmt(cost)}.`);
    return `§cYou need §f${fmt(cost)}§c.`;
  }
  d.level = lvl + 1;
  save(key, d);
  player.playSound("random.levelup");
  success(player, `Chunk Hopper storage is now ${commas(capacityOf(d))} items.`);
  return `§aStorage upgraded to §f${commas(capacityOf(d))} §aitems!`;
}

function upgradeSpeed(player, key) {
  const d = hoppers.get(key);
  if (!d || !canManage(player, d)) return "§cThis isn't your Chunk Hopper.";
  const spd = d.speed ?? 0;
  if (spd >= maxSpeed()) return "§aSpeed is already maxed.";
  const cost = CH.speedCosts[spd];
  if (!takeMoney(player, cost)) {
    fail(player, `You need ${fmt(cost)}.`);
    return `§cYou need §f${fmt(cost)}§c.`;
  }
  d.speed = spd + 1;
  save(key, d);
  nextRun.delete(key);
  player.playSound("random.levelup");
  success(player, `Chunk Hopper now collects every ${intervalOf(d)}s.`);
  return `§aSpeed upgraded - now collects every §f${intervalOf(d)}s§a!`;
}

function pickUp(player, key) {
  const d = hoppers.get(key);
  if (!d || !canManage(player, d)) return fail(player, "This isn't your Chunk Hopper.");
  const inv = player.getComponent("minecraft:inventory").container;
  const give = (st) => {
    const over = inv.addItem(st);
    if (over) player.dimension.spawnItem(over, player.location);
  };
  give(makeHopperItem(d.level ?? 0, d.speed ?? 0));
  for (const [id, count] of Object.entries(d.store ?? {})) {
    let left = count;
    while (left > 0) {
      try {
        const st = new ItemStack(id, 1);
        st.amount = Math.min(st.maxAmount, left);
        left -= st.amount;
        give(st);
      } catch {
        break;
      }
    }
  }
  try {
    world.getDimension(d.dim).getBlock(d)?.setType("minecraft:air");
  } catch {}
  forget(key);
  success(player, "Chunk Hopper picked up.");
}

// ---- events ---------------------------------------------------------------------------
export function registerChunkHoppers() {
  world.afterEvents.worldLoad.subscribe(() => {
    loadAll();
    system.runInterval(tick, 5);
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const { player, block } = ev;
    if (block.typeId === "minecraft:hopper") {
      const key = keyOf(block.dimension.id, block.location);
      if (hoppers.has(key)) {
        ev.cancel = true;
        if (ev.isFirstEvent) system.run(() => hopperMenu(player, key).catch((e) => console.warn("[eco] " + e)));
        return;
      }
    }
    const info = levelFromItem(ev.itemStack);
    if (info === undefined) return;
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const face = ev.blockFace;
    system.run(() => place(player, block, face, info));
  });

  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (ev.block.typeId !== "minecraft:hopper" || !hoppers.has(keyOf(ev.block.dimension.id, ev.block.location))) return;
    ev.cancel = true;
    const p = ev.player;
    system.run(() => p.sendMessage("§7Chunk Hoppers can't be mined. §fTap it §7and press §cPICK UP§7."));
  });

  world.beforeEvents.explosion.subscribe((ev) => {
    const blocks = ev.getImpactedBlocks();
    const keep = blocks.filter((b) => !(b.typeId === "minecraft:hopper" && hoppers.has(keyOf(b.dimension.id, b.location))));
    if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
  });
}
