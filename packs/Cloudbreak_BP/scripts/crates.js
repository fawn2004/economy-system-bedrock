import { ItemStack, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { addMoney, fmt } from "./eco/economy.js";
import { makeSpawnerItem, mobIcon, mobName } from "./eco/spawners.js";
import { getCatalog } from "./eco/catalog.js";
import { Screen } from "./screens.js";
import { pauseSidebar } from "./titles.js";

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

const opening = new Set();

/** Spins the reel on screen, then gives the reward. */
export async function openCrate(player, crate) {
  const c = CONFIG.crates[crate];
  const table = CRATE_REWARDS[crate];
  if (!c || !table || opening.has(player.id)) return;
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

  opening.add(player.id);
  const win = roll(table);
  give(player, win); // paid straight away, so leaving mid-spin never loses the reward
  // reel: random rewards, slowing down, ending on the win
  const frames = 22;
  for (let i = 0; i < frames && player.isValid; i++) {
    const w = i === frames - 1 ? win : table[Math.floor(Math.random() * table.length)];
    const rr = RARITY[w.r];
    pauseSidebar(player, 80);
    player.onScreenDisplay.setTitle(`${c.color}${c.name}`, {
      subtitle: `§8» ${rr.col}${rewardName(w)} §8«`,
      fadeInDuration: 0, stayDuration: i === frames - 1 ? 60 : 10, fadeOutDuration: i === frames - 1 ? 10 : 0,
    });
    player.playSound("random.click", { pitch: 0.8 + i / frames, volume: 0.6 });
    await system.waitTicks(2 + Math.floor((i * i) / 40));
  }
  opening.delete(player.id);
  if (!player.isValid) return;
  const rr = RARITY[win.r];
  player.playSound(win.r === "legendary" || win.r === "epic" ? "random.totem" : "random.levelup", { volume: 0.8 });
  player.sendMessage(`${CONFIG.prefix}${c.color}${c.name}§7: you won ${rr.col}${rr.name} §f${rewardName(win)}§7!`);
  if (win.r === "legendary") world.sendMessage(`${CONFIG.prefix}§e${player.name}§7 won ${rr.col}${rewardName(win)}§7 from a ${c.color}${c.name}§7!`);
  return crateScreen(player, crate, win);
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
export async function crateScreen(player, crate, win) {
  const c = CONFIG.crates[crate];
  const table = CRATE_REWARDS[crate];
  if (!c || !table || !player.isValid) return;
  const keys = countKeys(player, c.key);
  const s = new Screen("crate", c.name);
  s.text("CT", c.name.toUpperCase());
  s.text("KEYS", `§7Keys §e${keys}`, { icon: `textures/ui/cb/s/${KEY_ICON[crate] ?? "key_gold"}` });
  for (let i = 0; i < 7; i++) {
    const w = i === 3 && win ? win : table[Math.floor(Math.random() * table.length)];
    s.text("RL", rewardName(w), { icon: rewardIcon(w), states: [RARITY_TAG[w.r], i === 3 && win ? "WIN" : undefined] });
  }
  s.button("OP", keys ? (win ? "OPEN ANOTHER · 1 KEY" : "OPEN CRATE · 1 KEY") : "NO KEYS LEFT", () => (keys ? openCrate(player, crate) : crateScreen(player, crate, win)), { states: [keys ? undefined : "OFF"] });
  if (win) s.text("MSG", `§7You won ${RARITY[win.r].col}${RARITY[win.r].name} §f${rewardName(win)}§7!`);
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
