import { ItemStack, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { addMoney, fmt } from "./eco/economy.js";
import { makeSpawnerItem, mobIcon, mobName } from "./eco/spawners.js";
import { getCatalog } from "./eco/catalog.js";
import { Screen } from "./screens.js";

// ---------------------------------------------------------------------------
// Crates: use a crate key to open its crate. A reel spins through the rewards
// and stops on what you won. Rewards: { r: rarity, money } | { r, item, n } | { r, spawner }
// ---------------------------------------------------------------------------

export const RARITY = {
  common: { name: "Common", col: "§7", chance: 60 },
  rare: { name: "Rare", col: "§b", chance: 28 },
  epic: { name: "Epic", col: "§d", chance: 10 },
  legendary: { name: "Legendary", col: "§6", chance: 2 },
};

export const CRATE_REWARDS = {
  raider: [
    { r: "common", money: 5000 },
    { r: "common", item: "minecraft:diamond", n: 8 },
    { r: "common", item: "minecraft:iron_block", n: 8 },
    { r: "common", item: "minecraft:cobblestone", n: 256 },
    { r: "rare", money: 25000 },
    { r: "rare", spawner: "cow" },
    { r: "rare", item: "minecraft:golden_apple", n: 4 },
    { r: "epic", money: 75000 },
    { r: "epic", item: "minecraft:diamond_sword", n: 1 },
    { r: "legendary", money: 250000 },
    { r: "legendary", spawner: "blaze" },
  ],
  defender: [
    { r: "common", money: 5000 },
    { r: "common", item: "minecraft:obsidian", n: 32 },
    { r: "common", item: "minecraft:arrow", n: 64 },
    { r: "rare", money: 25000 },
    { r: "rare", item: "minecraft:shield", n: 1 },
    { r: "rare", spawner: "chicken" },
    { r: "epic", money: 75000 },
    { r: "epic", item: "minecraft:golden_apple", n: 8 },
    { r: "legendary", money: 250000 },
    { r: "legendary", item: "minecraft:enchanted_golden_apple", n: 1 },
  ],
  legendary: [
    { r: "common", money: 50000 },
    { r: "common", item: "minecraft:diamond_block", n: 8 },
    { r: "rare", money: 150000 },
    { r: "rare", spawner: "iron_golem" },
    { r: "epic", money: 500000 },
    { r: "epic", spawner: "blaze" },
    { r: "legendary", money: 2000000 },
    { r: "legendary", item: "minecraft:netherite_ingot", n: 4 },
  ],
};

export function rewardName(w) {
  if (w.money) return fmt(w.money);
  if (w.spawner) return `${mobName(w.spawner)} Spawner`;
  const id = w.item.replace("minecraft:", "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `${id}${w.n > 1 ? ` x${w.n}` : ""}`;
}

function roll(table) {
  const byR = Object.keys(RARITY).filter((r) => table.some((w) => w.r === r));
  let t = Math.random() * byR.reduce((n, r) => n + RARITY[r].chance, 0);
  let rar = byR[0];
  for (const r of byR) if ((t -= RARITY[r].chance) <= 0) { rar = r; break; }
  const pool = table.filter((w) => w.r === rar);
  return pool[Math.floor(Math.random() * pool.length)];
}

function give(player, w) {
  if (w.money) return addMoney(player, w.money);
  const stack = w.spawner ? makeSpawnerItem(w.spawner, 1, 1) : new ItemStack(w.item, w.n);
  const left = player.getComponent("minecraft:inventory")?.container?.addItem(stack);
  if (left) player.dimension.spawnItem(left, player.location);
}


/** Spins the reel on screen, then gives the reward. */
export async function openCrate(player, crate) {
  const c = CONFIG.crates[crate];
  const table = CRATE_REWARDS[crate];
  if (!c || !table) return;
  // take one key: the held stack first, else any stack in the inventory
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  let slot = player.selectedSlotIndex;
  if (inv.getItem(slot)?.typeId !== c.key) {
    slot = -1;
    for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === c.key) { slot = i; break; }
    if (slot < 0) return;
  }
  const held = inv.getItem(slot);
  if (held.amount > 1) {
    held.amount -= 1;
    inv.setItem(slot, held);
  } else inv.setItem(slot, undefined);

  const win = roll(table);
  give(player, win); // paid straight away, so closing the menu mid-spin never loses the reward
  const rr = RARITY[win.r];
  player.sendMessage(`${CONFIG.prefix}${c.color}${c.name}§7: you won ${rr.col}${rr.name} §f${rewardName(win)}§7!`);
  spinSounds(player, win);
  // the reel spins INSIDE the crate screen (a sliding strip, see build_cloudbreak_screens.py)
  return crateScreen(player, crate, win, true);
}

// Clicks that slow down with the reel, then a win sound when it stops (the screen stays open).
function spinSounds(player, win) {
  const end = SPIN_SECONDS * 20;
  let t = 2;
  for (let i = 0; t < end - 4; i++) {
    const at = t;
    system.runTimeout(() => player.isValid && player.playSound("random.click", { pitch: 0.7 + at / end, volume: 0.5 }), at);
    t += 2 + Math.floor((i * i) / 30);
  }
  system.runTimeout(() => {
    if (!player.isValid) return;
    player.playSound(win.r === "legendary" || win.r === "epic" ? "random.totem" : "random.levelup", { volume: 0.8 });
    if (win.r === "legendary") {
      const rr = RARITY[win.r];
      world.sendMessage(`${CONFIG.prefix}§e${player.name}§7 won ${rr.col}${rewardName(win)}§7!`);
    }
  }, end);
}

const RARITY_TAG = { common: "rC", rare: "rR", epic: "rE", legendary: "rL" };
const KEY_ICON = { raider: "key_pink", defender: "key_cyan", legendary: "key_gold" };

function countKeys(player, key) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  let n = 0;
  if (inv) for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it?.typeId === key) n += it.amount;
  }
  return n;
}

function rewardIcon(w) {
  if (w.money) return "textures/ui/cb/icon_sell";
  if (w.spawner) return mobIcon(w.spawner);
  return getCatalog().all.get(w.item)?.icon ?? "textures/ui/cb/icon_chest";
}

/** Crate Opening screen. win = the reward just won (shown in the middle of the reel). */
// The reel strip the screen slides: SPIN_COUNT rewards with the win at SPIN_WIN
// (must match tools/build_cloudbreak_screens.py).
const SPIN_COUNT = 24;
const SPIN_WIN = 20;
const SPIN_SECONDS = 4;

export async function crateScreen(player, crate, win, spinning = false) {
  const c = CONFIG.crates[crate];
  const table = CRATE_REWARDS[crate];
  if (!c || !table || !player.isValid) return;
  const keys = countKeys(player, c.key);
  const s = new Screen("crate", c.name);
  s.text("CT", c.name.toUpperCase());
  s.text("KEYS", `§7Keys §e${keys}`, { icon: `textures/ui/cb/s/${KEY_ICON[crate] ?? "key_gold"}` });
  const pick = () => table[Math.floor(Math.random() * table.length)];
  if (spinning) {
    for (let i = 0; i < SPIN_COUNT; i++) {
      const w = i === SPIN_WIN ? win : pick();
      s.text("RS", rewardName(w), { icon: rewardIcon(w), states: [RARITY_TAG[w.r], i === SPIN_WIN ? "WIN" : undefined] });
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const w = i === 3 && win ? win : pick();
      s.text("RL", rewardName(w), { icon: rewardIcon(w), states: [RARITY_TAG[w.r], i === 3 && win ? "WIN" : undefined] });
    }
  }
  s.button("OP", keys ? (win ? "OPEN ANOTHER · 1 KEY" : "OPEN CRATE · 1 KEY") : "NO KEYS LEFT", () => (keys ? openCrate(player, crate) : crateScreen(player, crate, win)), { states: [keys ? undefined : "OFF"] });
  if (win) s.text(spinning ? "MSGS" : "MSG", `§7You won ${RARITY[win.r].col}${RARITY[win.r].name} §f${rewardName(win)}§7!`);
  for (const [r, x] of Object.entries(RARITY)) {
    const items = table.filter((w) => w.r === r).map(rewardName);
    if (!items.length) continue;
    s.text("OD", `${x.col}${x.name}\n§7${items[0]}`, { states: [RARITY_TAG[r]] });
    s.text("ODP", `${x.chance}%`);
  }
  await s.show(player);
}

export function registerCrates() {
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    const crate = Object.keys(CONFIG.crates).find((k) => CONFIG.crates[k].key === itemStack?.typeId);
    if (crate) crateScreen(source, crate).catch((e) => console.warn(`[cloudbreak] crate: ${e}`));
  });
}
