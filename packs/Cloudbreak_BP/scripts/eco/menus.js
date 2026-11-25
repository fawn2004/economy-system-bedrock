import { ItemStack, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { filterItems, getCatalog, itemsDeep, search, sellPrice } from "./catalog.js";
import { BADGES, CHUNK_HOPPER, CONFIG, CROPS, KITS, MINION_SETTINGS, MINION_TYPES, SHOP_LAYOUT, SKILLS, SKILL_TOOLS, SPAWNERS } from "./config.js";
import { addMoney, fmt, fmtMoney, fmtShort, getBalance, rankOf, sellMultiplier, setBalance, takeMoney, topBalances } from "./economy.js";
import {
  applyEnchants,
  countPlain,
  freeSlots,
  giveCompass,
  giveItems,
  makeStack,
  removeAllPlain,
  spaceFor,
} from "./inventory.js";
import { settingsMenu } from "./adminSettings.js";
import { leaderboardsMenu } from "./leaderboards.js";
import { makeHopperItem } from "./chunkHopper.js";
import { NPC_TYPES, removeNearestNpc, setNpcOpeners, spawnNpc } from "./npc.js";
import { playerSettingsMenu } from "./playerSettings.js";
import { isMinionLoot, lootIcon, lootIdFor, lootName, lootSellPrice, makeMinionItem } from "./minions.js";
import { getSkillXp, levelInfo as skillLevelInfo, skillsMenu, xpToReach } from "./skills.js";
import { editItemMenu, editorMenu } from "./editor.js";
import { clearGroundItems } from "./groundItems.js";
import {
  addHeadPoints,
  allHeadPoints,
  countHeads,
  depositHeads,
  getHeadPoints,
  headItemId,
  makeSpawnerItem,
  mobIcon,
  mobName,
  ownedSpawnerCount,
} from "./spawners.js";
import {
  addCropPoints,
  collectionsMenu,
  countEnchanted,
  cropIcon,
  cropName,
  depositEnchanted,
  enchantedId,
  getCropPoints,
  makeTool,
  skillToolTiles,
} from "./tools.js";
import { ICON, askSearch, backTile, fail, showForm, success, tileMenu, withNav } from "./ui.js";

const U = "textures/ui/eco/";
const pretty = (id) =>
  id
    .replace(/^minecraft:/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const clip = (s, n = 18) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Items in a category including all of its sub-sections. */
function countDeep(id) {
  const { categories, byCategory } = getCatalog();
  let n = byCategory.get(id)?.length ?? 0;
  for (const c of categories) if (c.group === id) n += countDeep(c.id);
  return n;
}

const balLine = (player) => `§7Balance: §a${fmtMoney(getBalance(player))}`;
const msgLine = (msg) => (msg ? `${msg}\n` : "");
const priceColor = (player, cost) => (getBalance(player) >= cost ? "§a" : "§c");

// ============================================================================
//  MAIN COMPASS MENU
// ============================================================================
// Cloudbreak replaces the economy main menu with its own (the Elevator Tower).
// Every "Back" that used to lead to the economy main menu goes there instead.
let homeMenu;
export const setHomeMenu = (fn) => (homeMenu = fn);

export async function mainMenu(player) {
  if (homeMenu) return homeMenu(player);
  const rank = rankOf(player);
  const heads = allHeadPoints(player).reduce((n, h) => n + h.points, 0);
  const tiles = [
    { text: "§6§lSHOP", sub: "§7Buy any item", icon: ICON.shop, onClick: () => shopMenu(player) },
    { text: "§a§lSELL", sub: "§7Sell your loot", icon: ICON.sell, onClick: () => sellMenu(player) },
    { text: "§b§lPAY", sub: "§7Send money", icon: ICON.pay, onClick: () => payMenu(player, () => mainMenu(player)) },
    { text: "§6§lLEADERBOARDS", sub: "§7Who's on top", icon: ICON.top, onClick: () => leaderboardsMenu(player, () => mainMenu(player)) },
    {
      text: "§b§lSKILLS",
      sub: "§7Skills & collections",
      icon: "textures/items/iron_pickaxe",
      onClick: () =>
        skillsMenu(player, () => mainMenu(player), [
          { text: "§e§lCOLLECTIONS", sub: "§7Crops & mobs", icon: "textures/ui/eco/icon_farming", onClick: (back) => collectionsMenu(player, back) },
        ]),
    },
  ];
  tiles.push({
    text: "§9§lPLAYER SETTINGS",
    sub: "§7Sidebar, full bright...",
    icon: "textures/items/clock_item",
    onClick: () => playerSettingsMenu(player, () => mainMenu(player)),
  });
  if (player.hasTag(CONFIG.adminTag)) {
    tiles.push({ text: "§c§lADMIN", sub: "§7Settings & tools", icon: ICON.admin, onClick: () => adminMenu(player) });
  }
  // The player card on the left of the dashboard shows the form body
  const card = [
    `§l§f${clip(player.name, 14)}§r`,
    "",
    "§7Balance",
    `§a${fmtMoney(getBalance(player))}`,
    `§7Rank §6${rank ? "#" + rank : "-"}`,
    `§7Heads §d${heads}`,
    `§7Spawners §b${ownedSpawnerCount(player.id)}`,
  ].join("\n");
  await tileMenu(player, { title: "SKYBLOCK MENU", theme: "blue", layout: "dashboard", body: card, tiles });
}

// ============================================================================
//  SHOP
// ============================================================================
export async function shopMenu(player, msg) {
  return skyShopMenu(player, msg); // Cloudbreak: every shop "Back" leads to the Sky Shop
}

async function economyShopMenu(player, msg) {
  const { categories, byCategory } = getCatalog();
  const cat = (id) => categories.find((c) => c.id === id);
  const tiles = [];
  for (const key of SHOP_LAYOUT) {
    if (key === "blocks") {
      const n = countDeep("blocks");
      tiles.push({ text: "§e§lBLOCKS", sub: `§7${n} items`, icon: U + "icon_blocks", onClick: () => blocksMenu(player) });
    } else if (key === "kits") {
      tiles.push({ text: "§e§lKITS", sub: `§7${KITS.filter((k) => !k.disabled).length} kits`, icon: U + "icon_kits", badge: BADGES.kits, onClick: () => kitsMenu(player) });
    } else if (key === "spawners") {
      tiles.push({ text: "§e§lSPAWNERS", sub: `§7${SPAWNERS.filter((s) => !s.disabled).length} mobs`, icon: U + "icon_spawners", badge: BADGES.spawners, onClick: () => spawnersMenu(player) });
    } else if (key === "chunkhopper") {
      tiles.push({ text: "§6§lCHUNK HOPPER", sub: `${priceColor(player, CHUNK_HOPPER.price)}${fmtShort(CHUNK_HOPPER.price)}`, icon: "textures/items/hopper", badge: BADGES.chunkhopper, onClick: () => chunkHopperShop(player) });
    } else if (key === "minions") {
      tiles.push({ text: "§e§lMINIONS", sub: "§7They mine for you", icon: U + "icon_minion", badge: BADGES.minions, onClick: () => minionShop(player) });
    } else if (key === "skilltools") {
      tiles.push({ text: "§6§lSKILL TOOLS", sub: "§7Level-up tools", icon: SKILL_TOOL_ICON, badge: BADGES.skilltools, onClick: () => skillToolsMenu(player) });
    } else if (key === "search") {
      tiles.push({ text: "§b§lSEARCH", sub: "§7Find any item", icon: U + "icon_coin", onClick: () => searchMenu(player) });
    } else if (cat(key)) {
      const c = cat(key);
      tiles.push({
        text: `§e§l${c.name.toUpperCase()}`,
        sub: `§7${countDeep(c.id)} items`,
        icon: c.icon,
        badge: BADGES[c.id],
        onClick: () => categoryMenu(player, c, () => shopMenu(player)),
      });
    }
  }
  tiles.push(backTile(() => mainMenu(player)));
  await tileMenu(player, { title: "SHOP", theme: "gold", body: `${msgLine(msg)}§7Pick a category    ${balLine(player)}`, tiles });
}

/** A category's items, with any sub-categories (e.g. Farming > Saplings) shown first. */
function categoryMenu(player, c, back) {
  const { categories, byCategory } = getCatalog();
  const reopen = () => categoryMenu(player, c, back);
  const children = categories
    .filter((sub) => sub.group === c.id)
    .map((sub) => ({
      text: `§e§l${sub.name.toUpperCase()}`,
      sub: `§7${countDeep(sub.id)} items`,
      icon: sub.icon,
      onClick: () => categoryMenu(player, sub, reopen),
    }));
  return itemListMenu(player, {
    title: c.name.toUpperCase(),
    theme: c.theme,
    desc: c.desc,
    items: byCategory.get(c.id) ?? [],
    searchPool: itemsDeep(c.id), // the search button looks through sub-sections too
    children,
    back,
  });
}

async function blocksMenu(player) {
  const { categories, byCategory } = getCatalog();
  const tiles = categories
    .filter((c) => c.group === "blocks")
    .map((c) => ({
      text: `§e§l${c.name.toUpperCase()}`,
      sub: `§7${countDeep(c.id)} items`,
      icon: c.icon,
      onClick: () => categoryMenu(player, c, () => blocksMenu(player)),
    }));
  tiles.push(backTile(() => shopMenu(player)));
  await tileMenu(player, { title: "BLOCKS", theme: "blue", body: `§7Pick a type of block    ${balLine(player)}`, tiles });
}

/** A paged grid of catalogue items, with SEARCH / PREV / NEXT / BACK at the top and bottom. */
async function itemListMenu(player, list, page = 0) {
  const size = CONFIG.pageSize;
  const items = list.items.filter((e) => e.buy > 0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  page = Math.min(Math.max(0, page), pages - 1);
  const reopen = () => itemListMenu(player, list, page);
  const content = page === 0 ? [...(list.children ?? [])] : [];
  content.push(
    ...items.slice(page * size, page * size + size).map((e) => ({
      text: `§f${clip(e.name)}`,
      sub: `${priceColor(player, e.buy)}${fmtShort(e.buy)}`,
      icon: e.icon,
      onClick: () => buyItemMenu(player, e, reopen),
    }))
  );
  const tiles = withNav(content, {
    page,
    pages,
    goto: (p) => itemListMenu(player, list, p),
    back: list.back,
    onSearch: async () => {
      const q = await askSearch(player, `Search ${list.title.toLowerCase()}`);
      if (!q) return reopen();
      const found = filterItems(list.searchPool ?? list.items, q);
      if (!found.length) {
        fail(player, `No items in ${list.title.toLowerCase()} match "${q}".`);
        return reopen();
      }
      return itemListMenu(player, {
        title: `${list.title}: ${clip(q.toUpperCase(), 12)}`,
        theme: list.theme,
        desc: `${found.length} result${found.length === 1 ? "" : "s"} for "§f${q}§7" in ${list.title.toLowerCase()}`,
        items: found,
        back: reopen,
      });
    },
  });
  const pageInfo = pages > 1 ? `§7Page §f${page + 1}§7/§f${pages}    ` : "";
  await tileMenu(player, { title: list.title, theme: list.theme, body: `§7${list.desc}\n${pageInfo}${balLine(player)}`, tiles });
}

async function searchMenu(player) {
  const res = await showForm(player, new ModalFormData().title("Search the shop").textField("Item name", "e.g. diamond, oak, wool"));
  if (!res || res.canceled) return shopMenu(player);
  const query = String(res.formValues?.[0] ?? "").trim();
  const items = search(query).slice(0, 200);
  if (!items.length) return shopMenu(player, `§cNo items found for "§f${query}§c".`);
  await itemListMenu(player, { title: "SEARCH", theme: "blue", desc: `Results for "§f${query}§7" (${items.length})`, items, back: () => shopMenu(player) });
}

// ---- buying a normal item --------------------------------------------------
function amountsFor(id) {
  const max = makeStack(id)?.maxAmount ?? 64;
  if (max === 1) return [1, 2, 4];
  if (max === 16) return [1, 4, 8, 16];
  return [1, 8, 16, 32, 64];
}

async function buyItemMenu(player, item, back, msg) {
  const tiles = amountsFor(item.id).map((n) => {
    const cost = item.buy * n;
    return {
      text: `§f§lBUY x${n}`,
      sub: `${priceColor(player, cost)}${fmtShort(cost)}`,
      icon: item.icon,
      onClick: () => buyItemMenu(player, item, back, buyItem(player, item, n)),
    };
  });
  if (player.hasTag(CONFIG.adminTag)) {
    tiles.push({
      text: "§c§lEDIT",
      sub: "§7Admin only",
      icon: ICON.admin,
      onClick: () => editItemMenu(player, item.id, () => buyItemMenu(player, getCatalog().all.get(item.id) ?? item, back)),
    });
  }
  tiles.push(backTile(back));
  const sellInfo = item.sell > 0 ? `§7Sells for: §6${fmt(item.sell)}` : "§8Can't be sold";
  await tileMenu(player, {
    title: clip(item.name.toUpperCase(), 24),
    theme: "gold",
    body: `${msgLine(msg)}§f${item.name}\n§7Buy: §a${fmt(item.buy)} §7each    ${sellInfo}\n${balLine(player)}`,
    tiles,
  });
}

function buyItem(player, item, amount) {
  const cost = item.buy * amount;
  if (getBalance(player) < cost) {
    fail(player, `You need ${fmt(cost)} but only have ${fmtMoney(getBalance(player))}.`);
    return `§cYou can't afford that! (§f${fmt(cost)}§c)`;
  }
  if (spaceFor(player, item.id) < amount) {
    fail(player, "Not enough inventory space.");
    return "§cNot enough inventory space!";
  }
  takeMoney(player, cost);
  giveItems(player, item.id, amount);
  success(player, `Bought ${amount}x ${item.name} for ${fmt(cost)}.`);
  return `§aBought §f${amount}x ${item.name} §afor §f${fmt(cost)}`;
}

// ---- chunk hopper ---------------------------------------------------------------
async function chunkHopperShop(player, msg) {
  const H = CHUNK_HOPPER;
  await tileMenu(player, {
    title: "CHUNK HOPPER",
    theme: "gold",
    body:
      (msg ? msg + "\n" : "") +
      "§7Collects §fevery dropped item in its chunk §7into its own storage.\n" +
      `§7Tap it to §6sell all§7, §acollect all §7or §bupgrade storage §7(${String(H.baseStorage).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} items to start). One per chunk.    ${balLine(player)}`,
    tiles: [
      {
        text: "§a§lBUY",
        sub: `${priceColor(player, H.price)}${fmtShort(H.price)}`,
        icon: "textures/items/hopper",
        onClick: () => {
          if (getBalance(player) < H.price) {
            fail(player, `You need ${fmt(H.price)}.`);
            return chunkHopperShop(player, `§cYou need §f${fmt(H.price)}§c.`);
          }
          if (freeSlots(player) < 1) return chunkHopperShop(player, "§cYou need a free inventory slot!");
          takeMoney(player, H.price);
          player.getComponent("minecraft:inventory").container.addItem(makeHopperItem(0));
          success(player, "Bought a Chunk Hopper! Place it anywhere in the chunk you want to collect.");
          return chunkHopperShop(player, "§aBought a §fChunk Hopper§a! Place it in the chunk you want to collect.");
        },
      },
      backTile(() => shopMenu(player)),
    ],
  });
}

// ---- minions -------------------------------------------------------------------
async function minionShop(player, msg) {
  const kinds = [
    { id: "mining", name: "MINING MINIONS", sub: "§7Ores & rare blocks", icon: "textures/items/diamond_pickaxe" },
    { id: "farming", name: "FARMING MINIONS", sub: "§7Crops & plants", icon: "textures/items/diamond_hoe" },
  ];
  const tiles = kinds.map((k) => ({
    text: `§e§l${k.name}`,
    sub: k.sub,
    icon: k.icon,
    onClick: () => minionKindShop(player, k),
  }));
  tiles.push(backTile(() => shopMenu(player)));
  await tileMenu(player, {
    title: "MINIONS",
    theme: "orange",
    body:
      (msg ? msg + "\n" : "") +
      "§7Minions collect enchanted items for you - even while you're away.\n" +
      `§7Better minions cost more but pay a lot more. §8(max ${MINION_SETTINGS.maxPerPlayer} each)    ${balLine(player)}`,
    tiles,
  });
}

async function minionKindShop(player, k) {
  const tiles = MINION_TYPES.filter((t) => (t.kind ?? "mining") === k.id).map((t) => ({
    text: `§e§l${t.name.toUpperCase()}`,
    sub: `${priceColor(player, t.price)}${fmtShort(t.price)}`,
    icon: U + "icon_minion",
    onClick: () => minionTypeShop(player, t, undefined, () => minionKindShop(player, k)),
  }));
  tiles.push(backTile(() => minionShop(player)));
  await tileMenu(player, { title: k.name, theme: "orange", body: `§7Pick a minion to see what it collects.    ${balLine(player)}`, tiles });
}

async function minionTypeShop(player, t, msg, back = () => minionShop(player)) {
  const first = t.tiers[0], last = t.tiers[t.tiers.length - 1];
  await tileMenu(player, {
    title: `${t.name.toUpperCase()} MINION`,
    theme: "orange",
    body:
      (msg ? msg + "\n" : "") +
      `§7${t.kind === "farming" ? "Farms" : "Mines"}: §f${t.tiers.map((x) => x.name).join(" §7> §f")}\n` +
      `§7Each item sells for §a${fmt(lootSellPrice(lootIdFor(first.drop[0])))} §7(${first.name}) up to §a${fmt(lootSellPrice(lootIdFor(last.drop[0])))} §7(${last.name})\n` +
      `§7Upgrades cost §fx${t.upgradeMultiplier}§7.    ${balLine(player)}`,
    tiles: [
      {
        text: `§a§lBUY`,
        sub: `${priceColor(player, t.price)}${fmtShort(t.price)}`,
        icon: U + "icon_minion",
        onClick: () => {
          if (getBalance(player) < t.price) {
            fail(player, `You need ${fmt(t.price)}.`);
            return minionTypeShop(player, t, `§cYou need §f${fmt(t.price)}§c.`, back);
          }
          if (freeSlots(player) < 1) return minionTypeShop(player, t, "§cYou need a free inventory slot!", back);
          takeMoney(player, t.price);
          player.getComponent("minecraft:inventory").container.addItem(makeMinionItem(0, {}, t.id));
          success(player, `Bought a ${t.name} Minion! Place it on a block.`);
          return minionTypeShop(player, t, `§aBought a §f${t.name} Minion§a! Place it on a block.`, back);
        },
      },
      backTile(back),
    ],
  });
}

// ---- skill tools -------------------------------------------------------------
const SKILL_TOOL_ICON = "textures/items/diamond_hoe";

async function skillToolsMenu(player, msg) {
  const tiles = skillToolTiles(player, (kind) => {
    const t = SKILL_TOOLS[kind];
    if (getBalance(player) < t.price) {
      fail(player, `You need ${fmt(t.price)}.`);
      return skillToolsMenu(player, `§cYou need §f${fmt(t.price)}§c.`);
    }
    if (freeSlots(player) < 1) {
      fail(player, "You need a free inventory slot.");
      return skillToolsMenu(player, "§cYou need a free inventory slot!");
    }
    takeMoney(player, t.price);
    player.getComponent("minecraft:inventory").container.addItem(makeTool(kind, player));
    success(player, `Bought a ${t.name}! It levels up as you use it.`);
    return skillToolsMenu(player, `§aBought a §f${t.name}§a!`);
  });
  tiles.push(backTile(() => shopMenu(player)));
  await tileMenu(player, {
    title: "SKILL TOOLS",
    theme: "gold",
    body:
      (msg ? msg + "\n" : "") +
      "§7Tools that §fgain XP and level up§7 as you use them: more bonus drops,\n" +
      "§7auto-replant (hoe) and better head chance (sword). They never break.\n" +
      `§8Higher levels need collections - see Collections > Skill Tools.    ${balLine(player)}`,
    tiles,
  });
}

// ---- kits ------------------------------------------------------------------
function kitCooldownLeft(player, kit) {
  const last = player.getDynamicProperty(`eco:kit:${kit.id}`);
  if (typeof last !== "number" || !kit.cooldown) return 0;
  return Math.max(0, Math.ceil((last + kit.cooldown * 1000 - Date.now()) / 1000));
}

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export async function kitsMenu(player) {
  const tiles = KITS.filter((k) => !k.disabled).map((kit) => {
    const wait = kitCooldownLeft(player, kit);
    return {
      text: `§f${kit.name}`,
      sub: wait > 0 ? `§c${formatTime(wait)}` : `${priceColor(player, kit.price)}${fmtShort(kit.price)}`,
      icon: kit.icon,
      badge: kit.badge,
      onClick: () => kitMenu(player, kit),
    };
  });
  tiles.push(backTile(() => shopMenu(player)));
  await tileMenu(player, { title: "KITS", theme: "purple", body: `§7Gear bundles with cooldowns    ${balLine(player)}`, tiles });
}

async function kitMenu(player, kit, msg) {
  const contents = kit.items.map((i) => `${i.amount ? i.amount + "x " : ""}${pretty(i.id)}`).join("§7, §f");
  const wait = kitCooldownLeft(player, kit);
  await tileMenu(player, {
    title: kit.name.toUpperCase(),
    theme: "purple",
    body:
      `${msgLine(msg)}§7Contains: §f${contents}\n` +
      `§7Price: §a${fmt(kit.price)}  §7Cooldown: §f${formatTime(kit.cooldown ?? 0)}    ${balLine(player)}`,
    tiles: [
      {
        text: "§a§lBUY KIT",
        sub: wait > 0 ? `§c${formatTime(wait)}` : `${priceColor(player, kit.price)}${fmtShort(kit.price)}`,
        icon: kit.icon,
        onClick: () => kitMenu(player, kit, buyKit(player, kit)),
      },
      backTile(() => kitsMenu(player)),
    ],
  });
}

function buyKit(player, kit) {
  const wait = kitCooldownLeft(player, kit);
  if (wait > 0) {
    fail(player, `You can buy this kit again in ${formatTime(wait)}.`);
    return `§cOn cooldown for §f${formatTime(wait)}`;
  }
  if (getBalance(player) < kit.price) {
    fail(player, `You need ${fmt(kit.price)}.`);
    return "§cYou can't afford this kit!";
  }
  if (freeSlots(player) < kit.items.length) {
    fail(player, `You need ${kit.items.length} free inventory slots.`);
    return `§cYou need §f${kit.items.length} §cfree slots!`;
  }
  takeMoney(player, kit.price);
  for (const i of kit.items) {
    giveItems(player, i.id, i.amount ?? 1, (stack) => {
      applyEnchants(stack, i.enchants);
      if (i.name) stack.nameTag = i.name;
      stack.setLore(["§8Kit item"]); // kit items can't be sold back to the shop
    });
  }
  player.setDynamicProperty(`eco:kit:${kit.id}`, Date.now());
  success(player, `Bought the ${kit.name} for ${fmt(kit.price)}.`);
  return `§aBought the §f${kit.name}§a!`;
}

// ---- spawners --------------------------------------------------------------
async function spawnersMenu(player) {
  const tiles = SPAWNERS.filter((s) => !s.disabled).map((sp) => ({
    text: `§f${sp.name}`,
    sub: `${priceColor(player, sp.price)}${fmtShort(sp.price)}`,
    icon: sp.icon,
    badge: sp.badge,
    onClick: () => spawnerMenu(player, sp),
  }));
  tiles.push(backTile(() => shopMenu(player)));
  await tileMenu(player, {
    title: "SPAWNERS",
    theme: "red",
    body: `§7Stack them, upgrade them with enchanted heads    ${balLine(player)}`,
    tiles,
  });
}

async function spawnerMenu(player, sp, msg) {
  const tiles = [1, 2, 5].map((n) => {
    const cost = sp.price * n;
    return {
      text: `§f§lBUY x${n}`,
      sub: `${priceColor(player, cost)}${fmtShort(cost)}`,
      icon: sp.icon,
      onClick: () => spawnerMenu(player, sp, buySpawner(player, sp, n)),
    };
  });
  tiles.push(backTile(() => spawnersMenu(player)));
  await tileMenu(player, {
    title: `${sp.name.toUpperCase()} SPAWNER`,
    theme: "red",
    body:
      `${msgLine(msg)}§f${sp.name} Spawner §7- §a${fmt(sp.price)} §7each\n` +
      `§7Place it on your island, then §fsneak and tap it §7to\n§7upgrade it with §dEnchanted ${sp.name} Heads§7.    ${balLine(player)}`,
    tiles,
  });
}

function buySpawner(player, sp, amount) {
  const cost = sp.price * amount;
  if (getBalance(player) < cost) {
    fail(player, `You need ${fmt(cost)}.`);
    return `§cYou can't afford that! (§f${fmt(cost)}§c)`;
  }
  if (freeSlots(player) < 1) {
    fail(player, "You need a free inventory slot.");
    return "§cYou need a free inventory slot!";
  }
  takeMoney(player, cost);
  const overflow = player.getComponent("minecraft:inventory").container.addItem(makeSpawnerItem(sp.mob, amount));
  if (overflow) player.dimension.spawnItem(overflow, player.location);
  success(player, `Bought ${amount}x ${sp.name} Spawner for ${fmt(cost)}.`);
  return `§aBought §f${amount}x ${sp.name} Spawner§a!`;
}

// ============================================================================
//  SELL
// ============================================================================
export async function sellMenu(player, msg) {
  const { byId } = getCatalog();
  // shop items + enchanted minion items (worth lootMultiplier x)
  const priceOf = (id) => sellPrice(id) || lootSellPrice(id);
  const sellable = [...countPlain(player)].filter(([id]) => priceOf(id) > 0);
  sellable.sort((a, b) => priceOf(b[0]) * b[1] - priceOf(a[0]) * a[1]);
  const total = sellable.reduce((sum, [id, n]) => sum + priceOf(id) * n, 0);

  // Heads & enchanted crops are worth nothing in money: selling them only adds
  // them to the player's head / enchanted crop balances.
  const enchanted = [...countEnchanted(player)];
  const heads = [...countHeads(player)];
  const headCount = heads.reduce((n, [, c]) => n + c, 0);
  const cropCount = enchanted.reduce((n, [, c]) => n + c, 0);

  const tiles = [];
  if (sellable.length || heads.length || enchanted.length) {
    const parts = [];
    if (total) parts.push(`§a${fmtShort(total)}`);
    if (headCount) parts.push(`§d+${headCount}h`);
    if (cropCount) parts.push(`§2+${cropCount}e`);
    tiles.push({
      text: "§a§lSELL ALL",
      sub: parts.join(" "),
      icon: ICON.sell,
      badge: "HOT",
      onClick: () => {
        let earned = 0;
        for (const [id] of sellable) earned += priceOf(id) * removeAllPlain(player, id);
        earned = Math.floor(earned * sellMultiplier(player));
        if (earned) addMoney(player, earned);
        const h = [...depositHeads(player).values()].reduce((n, c) => n + c, 0);
        const c = [...depositEnchanted(player).values()].reduce((n, x) => n + x, 0);
        const done = [];
        if (earned) done.push(`§f${fmt(earned)}`);
        if (h) done.push(`§d${h} heads §7added to your head count`);
        if (c) done.push(`§2${c} enchanted crops §7added to your balance`);
        success(player, `Sold everything: ${done.map((x) => x.replace(/§./g, "")).join(", ")}.`);
        return sellMenu(player, `§aSold everything: ${done.join("§a, ")}§a.`);
      },
    });
  }
  for (const [mob, n] of heads) {
    tiles.push({
      text: `§d${clip(mobName(mob) + " Head")}`,
      sub: `§7x${n} §d+${n} heads`,
      icon: mobIcon(mob),
      onClick: () => {
        const got = depositHeads(player, mob).get(mob) ?? 0;
        success(player, `Added ${got} ${mobName(mob)} heads to your head count.`);
        return sellMenu(player, `§dAdded §f${got} ${mobName(mob)} §dheads to your head count`);
      },
    });
  }
  for (const [cid, n] of enchanted) {
    tiles.push({
      text: `§aEnch. ${clip(cropName(cid), 12)}`,
      sub: `§7x${n} §2+${n}`,
      icon: cropIcon(cid),
      onClick: () => {
        const got = depositEnchanted(player, cid).get(cid) ?? 0;
        success(player, `Added ${got} Enchanted ${cropName(cid)} to your balance.`);
        return sellMenu(player, `§aAdded §f${got} Enchanted ${cropName(cid)}`);
      },
    });
  }
  for (const [id, n] of sellable.slice(0, 40)) {
    const e = byId.get(id);
    const name = e?.name ?? (isMinionLoot(id) ? lootName(id) : pretty(id));
    tiles.push({
      text: `${isMinionLoot(id) ? "§b" : "§f"}${clip(name)}`,
      sub: `§7x${n} §a${fmtShort(priceOf(id) * n)}`,
      icon: e?.icon ?? (isMinionLoot(id) ? lootIcon(id) : ICON.coin),
      onClick: () => {
        const sold = removeAllPlain(player, id);
        const earned = Math.floor(sold * priceOf(id) * sellMultiplier(player));
        addMoney(player, earned);
        success(player, `Sold ${sold}x ${name} for ${fmt(earned)}.`);
        return sellMenu(player, `§aSold §f${sold}x ${name} §afor §f${fmt(earned)}`);
      },
    });
  }
  tiles.push(backTile(() => mainMenu(player)));

  const info = sellable.length || heads.length || enchanted.length
    ? "§7Click an item to sell all of it. §dHeads §7and §2enchanted crops §7aren't worth money -\n§7they're added to your head count / crop balance for upgrades."
    : "§7You have nothing that can be sold. §8(Kit & renamed items can't be sold)";
  await tileMenu(player, { title: "SELL", theme: "green", body: `${msgLine(msg)}${info}    ${balLine(player)}`, tiles });
}

// ============================================================================
//  BALANCE / PAY / BALTOP
// ============================================================================
async function balanceMenu(player) {
  const rank = rankOf(player);
  await tileMenu(player, {
    title: "BALANCE",
    theme: "gold",
    body: `§7Your balance: §a§l${fmtMoney(getBalance(player))}§r\n§7Leaderboard rank: §6${rank ? "#" + rank : "-"}`,
    tiles: [
      { text: "§b§lPAY", sub: "§7Send money", icon: ICON.pay, onClick: () => payMenu(player, () => balanceMenu(player)) },
      { text: "§6§lBALTOP", sub: "§7Top 10", icon: ICON.top, onClick: () => topMenu(player, () => balanceMenu(player)) },
      { text: "§d§lHEADS", sub: "§7Head balances", icon: ICON.bank, onClick: () => headsMenu(player) },
      backTile(() => mainMenu(player)),
    ],
  });
}

async function headsMenu(player) {
  const heads = allHeadPoints(player);
  await tileMenu(player, {
    title: "HEAD BALANCE",
    theme: "purple",
    body: heads.length
      ? "§7Heads can only upgrade spawners of the same mob.\n§8Get them from mobs your spawners spawn, then sell them."
      : "§7You have no heads yet. Mobs from your spawners can drop §dEnchanted Heads§7 - sell them to add them here.",
    tiles: [
      ...heads.map((h) => ({ text: `§d${clip(mobName(h.mob))}`, sub: `§f${h.points} heads`, icon: mobIcon(h.mob), onClick: () => headsMenu(player) })),
      backTile(() => balanceMenu(player)),
    ],
  });
}

export async function payMenu(player, back) {
  const others = world.getPlayers().filter((p) => p.id !== player.id);
  const tiles = others.map((p) => ({
    text: `§f${p.name}`,
    sub: "§7Click to pay",
    icon: ICON.player,
    onClick: () => payAmountMenu(player, p, back),
  }));
  tiles.push(backTile(back));
  await tileMenu(player, {
    title: "PAY A PLAYER",
    theme: "blue",
    body: others.length ? `§7Who do you want to pay?    ${balLine(player)}` : "§7Nobody else is online right now.",
    tiles,
  });
}

async function payAmountMenu(player, target, back) {
  const bal = getBalance(player);
  const presets = [100, 1000, 10000, 100000].filter((n) => n <= bal);
  const tiles = presets.map((n) => ({
    text: `§f§l${fmtShort(n)}`,
    sub: "§7Send",
    icon: ICON.coin,
    onClick: () => pay(player, target, n, back),
  }));
  if (bal > 0) {
    tiles.push({ text: "§e§lALL", sub: `§a${fmtShort(bal)}`, icon: ICON.bank, onClick: () => pay(player, target, bal, back) });
  }
  tiles.push({
    text: "§b§lCUSTOM",
    sub: "§7Type amount",
    icon: ICON.pay,
    onClick: async () => {
      const res = await showForm(
        player,
        new ModalFormData().title(`Pay ${target.name}`).textField(`Amount (you have ${fmt(bal)})`, "e.g. 2500")
      );
      if (!res || res.canceled) return payAmountMenu(player, target, back);
      const amount = Math.floor(Number(String(res.formValues[0]).replace(/[,$\s]/g, "")));
      if (!Number.isFinite(amount) || amount <= 0) {
        fail(player, "Enter a whole number above 0.");
        return payAmountMenu(player, target, back);
      }
      return pay(player, target, amount, back);
    },
  });
  tiles.push(backTile(() => payMenu(player, back)));
  await tileMenu(player, {
    title: `PAY ${target.name.toUpperCase()}`,
    theme: "blue",
    body: `§7How much do you want to send to §f${target.name}§7?    ${balLine(player)}`,
    tiles,
  });
}

function pay(player, target, amount, back) {
  if (!target.isValid) {
    fail(player, "That player has left.");
    return payMenu(player, back);
  }
  if (!takeMoney(player, amount)) {
    fail(player, "You don't have enough money.");
    return payAmountMenu(player, target, back);
  }
  addMoney(target, amount);
  success(player, `You paid ${target.name} ${fmt(amount)}.`);
  target.sendMessage(`§a§l$ §r§f${player.name} §apaid you §f${fmt(amount)}§a.`);
  target.playSound("random.levelup");
}

async function topMenu(player, back) {
  const top = topBalances(10);
  const medal = ["§6", "§f", "§c"];
  const lines = top.length
    ? top.map((e, i) => `${medal[i] ?? "§7"}#${i + 1} §f${e.name} §7- §a${fmt(e.score)}`).join("\n")
    : "§7No one has any money yet!";
  await tileMenu(player, { title: "RICHEST PLAYERS", theme: "gold", body: lines, tiles: [backTile(back)] });
}

// ============================================================================
//  ADMIN  (players with the "admin" tag)
// ============================================================================
export async function adminMenu(player, msg) {
  if (!player.hasTag(CONFIG.adminTag)) return;
  const back = () => adminMenu(player);
  await tileMenu(player, {
    title: "ADMIN PANEL",
    theme: "red",
    body: (msg ? msg + "\n" : "") + "§7Admin tools. §8Only players with the admin tag see this.",
    tiles: [
      { text: "§a§lMONEY", sub: "§7Player balances", icon: ICON.bank, onClick: () => adminMoneyMenu(player) },
      { text: "§d§lHEADS", sub: "§7Player head balances", icon: mobIcon("zombie"), onClick: () => adminHeadsMenu(player) },
      { text: "§6§lNPCS", sub: "§7Shop keepers", icon: ICON.player, onClick: () => adminNpcMenu(player) },
      { text: "§b§lSETTINGS", sub: "§7Spawners, kits...", icon: ICON.admin, onClick: () => settingsMenu(player, back) },
      { text: "§6§lSHOP EDITOR", sub: "§7Move/hide items", icon: ICON.shop, onClick: () => editorMenu(player, back) },
      {
        text: "§c§lCLEAR ITEMS",
        sub: "§7Remove floor items",
        icon: ICON.cancel,
        onClick: () => {
          const n = clearGroundItems();
          success(player, `Removed ${n} dropped item piles.`);
          return adminMenu(player, `§aRemoved §f${n} §adropped item piles.`);
        },
      },
      backTile(() => mainMenu(player)),
    ],
  });
}

// ---- admin: money ------------------------------------------------------------
async function adminMoneyMenu(player) {
  if (!player.hasTag(CONFIG.adminTag)) return;
  const tiles = world.getPlayers().map((p) => ({
    text: `§f${clip(p.name)}`,
    sub: `§a${fmtShort(getBalance(p))}`,
    icon: ICON.player,
    onClick: () => adminPlayerMenu(player, p),
  }));
  tiles.push(backTile(() => adminMenu(player)));
  await tileMenu(player, {
    title: "PLAYER MONEY",
    theme: "green",
    body: "§7Pick a player to add, remove or set their money.\n§8Tip: /scoreboard players add <name> money <amount> also works",
    tiles,
  });
}

async function adminPlayerMenu(player, target, msg) {
  if (!target.isValid) return adminMoneyMenu(player);
  const change = (delta) => () => {
    const now = delta === null ? setBalance(target, 0) : addMoney(target, delta);
    success(player, `${target.name} now has ${fmt(now)}.`);
    return adminPlayerMenu(player, target, `§a${target.name} now has §f${fmt(now)}`);
  };
  const tiles = [
    { text: "§a§l+1k", sub: "§7Add", icon: ICON.coin, onClick: change(1000) },
    { text: "§a§l+10k", sub: "§7Add", icon: ICON.coin, onClick: change(10000) },
    { text: "§a§l+100k", sub: "§7Add", icon: ICON.bank, onClick: change(100000) },
    { text: "§c§l-1k", sub: "§7Remove", icon: ICON.coin, onClick: change(-1000) },
    { text: "§c§l-10k", sub: "§7Remove", icon: ICON.coin, onClick: change(-10000) },
    { text: "§4§lRESET", sub: "§7Set to $0", icon: ICON.cancel, onClick: change(null) },
    {
      text: "§b§lCUSTOM",
      sub: "§7Add/Remove/Set",
      icon: ICON.admin,
      onClick: async () => {
        const res = await showForm(
          player,
          new ModalFormData().title(`Edit ${target.name}`).dropdown("Action", ["Add", "Remove", "Set"]).textField("Amount", "1000")
        );
        if (!res || res.canceled) return adminPlayerMenu(player, target);
        const [action, raw] = res.formValues;
        const amount = Math.floor(Number(String(raw).replace(/[,$\s]/g, "")));
        if (!Number.isFinite(amount) || amount < 0) {
          fail(player, "Enter a whole number.");
          return adminPlayerMenu(player, target);
        }
        if (!target.isValid) return adminMoneyMenu(player);
        const now =
          action === 0 ? addMoney(target, amount) : action === 1 ? addMoney(target, -amount) : setBalance(target, amount);
        success(player, `${target.name} now has ${fmt(now)}.`);
        return adminPlayerMenu(player, target, `§a${target.name} now has §f${fmt(now)}`);
      },
    },
    backTile(() => adminMoneyMenu(player)),
  ];
  await tileMenu(player, {
    title: target.name.toUpperCase(),
    theme: "red",
    body: `${msgLine(msg)}§7Balance of §f${target.name}§7: §a${fmtMoney(getBalance(target))}`,
    tiles,
  });
}

// ---- admin: heads ------------------------------------------------------------
// ---- admin: NPCs -----------------------------------------------------------------
async function adminNpcMenu(player, msg) {
  if (!player.hasTag(CONFIG.adminTag)) return;
  const spawn = (type, label) => () => {
    spawnNpc(player, type);
    success(player, `Spawned a ${label} NPC where you're standing.`);
    return adminNpcMenu(player, `§aSpawned a §f${label} §aNPC. Step away to see it.`);
  };
  await tileMenu(player, {
    title: "NPCS",
    theme: "orange",
    body:
      (msg ? msg + "\n" : "") +
      "§7Spawn a big shopkeeper where you're standing (it faces you).\n" +
      "§7Players tap it instead of using the compass. §8Remove = nearest NPC within 6 blocks.",
    tiles: [
      { text: "§6§lSHOP NPC", sub: "§7Opens the shop", icon: ICON.shop, onClick: spawn("shop", "Shop") },
      { text: "§a§lSELL NPC", sub: "§7Opens Sell", icon: ICON.sell, onClick: spawn("sell", "Sell") },
      { text: "§b§lMENU NPC", sub: "§7Opens the menu", icon: ICON.top, onClick: spawn("menu", "Menu") },
      {
        text: "§c§lREMOVE NPC",
        sub: "§7Nearest one",
        icon: ICON.cancel,
        onClick: () => {
          const ok = removeNearestNpc(player);
          if (ok) success(player, "Removed the nearest NPC.");
          return adminNpcMenu(player, ok ? "§aRemoved the nearest NPC." : "§cNo NPC within 6 blocks.");
        },
      },
      backTile(() => adminMenu(player)),
    ],
  });
}

// ---- admin: skills ------------------------------------------------------------
async function adminSkillsMenu(player) {
  if (!player.hasTag(CONFIG.adminTag)) return;
  const tiles = world.getPlayers().map((p) => ({
    text: `§f${clip(p.name)}`,
    sub: "§7Set skill levels",
    icon: ICON.player,
    onClick: () => adminSkillsPlayer(player, p),
  }));
  tiles.push(backTile(() => adminMenu(player)));
  await tileMenu(player, { title: "PLAYER SKILLS", theme: "blue", body: "§7Pick a player to set their skill levels.", tiles });
}

async function adminSkillsPlayer(player, target, msg) {
  if (!target.isValid) return adminSkillsMenu(player);
  const tiles = Object.entries(SKILLS).map(([id, sk]) => ({
    text: `§b§l${sk.name.toUpperCase()}`,
    sub: `§fLv ${skillLevelInfo(getSkillXp(target, id)).level}`,
    icon: sk.icon,
    onClick: async () => {
      const res = await showForm(
        player,
        new ModalFormData().title(`${sk.name}: ${target.name}`).textField("Set level to", String(skillLevelInfo(getSkillXp(target, id)).level))
      );
      if (!res || res.canceled) return adminSkillsPlayer(player, target);
      const lvl = Math.floor(Number(res.formValues[0]));
      if (!Number.isFinite(lvl) || lvl < 0) return adminSkillsPlayer(player, target, "§cEnter a whole number.");
      target.setDynamicProperty(`eco:skill:${id}`, xpToReach(lvl));
      success(player, `${target.name}'s ${sk.name} is now level ${skillLevelInfo(getSkillXp(target, id)).level}.`);
      return adminSkillsPlayer(player, target, `§a${sk.name} set to level ${skillLevelInfo(getSkillXp(target, id)).level}`);
    },
  }));
  tiles.push(backTile(() => adminSkillsMenu(player)));
  await tileMenu(player, {
    title: `${clip(target.name.toUpperCase(), 16)}: SKILLS`,
    theme: "blue",
    body: `${msg ? msg + "\n" : ""}§7Tap a skill to set §f${target.name}§7's level. §8(No level-up rewards are paid.)`,
    tiles,
  });
}

// ---- admin: enchanted crops --------------------------------------------------
async function adminCropsMenu(player) {
  if (!player.hasTag(CONFIG.adminTag)) return;
  const tiles = world.getPlayers().map((p) => ({
    text: `§f${clip(p.name)}`,
    sub: `§a${CROPS.reduce((n, c) => n + getCropPoints(p, c.id), 0)} ench.`,
    icon: ICON.player,
    onClick: () => adminCropsPlayer(player, p),
  }));
  tiles.push(backTile(() => adminMenu(player)));
  await tileMenu(player, { title: "PLAYER CROPS", theme: "green", body: "§7Pick a player to give or take enchanted crops.", tiles });
}

async function adminCropsPlayer(player, target) {
  if (!target.isValid) return adminCropsMenu(player);
  const tiles = CROPS.map((c) => ({
    text: `§f${clip(c.name)}`,
    sub: `§a${getCropPoints(target, c.id)}`,
    icon: c.icon,
    onClick: () => adminCropOne(player, target, c.id),
  }));
  await tileMenu(player, {
    title: `${clip(target.name.toUpperCase(), 16)}: CROPS`,
    theme: "green",
    body: `§7Pick a crop to change §f${target.name}§7's enchanted balance.`,
    tiles: withNav(tiles, { back: () => adminCropsMenu(player) }),
  });
}

async function adminCropOne(player, target, cid, msg) {
  if (!target.isValid) return adminCropsMenu(player);
  const name = `Enchanted ${cropName(cid)}`;
  const change = (delta) => () => {
    const now = delta === null ? 0 : Math.max(0, getCropPoints(target, cid) + delta);
    addCropPoints(target, cid, now - getCropPoints(target, cid));
    success(player, `${target.name} now has ${now} ${name}.`);
    return adminCropOne(player, target, cid, `§a${target.name} now has §f${now} §a${name}`);
  };
  await tileMenu(player, {
    title: clip(name.toUpperCase(), 22),
    theme: "green",
    body: `${msg ? msg + "\n" : ""}§f${target.name}§7 has §a${getCropPoints(target, cid)} ${name}§7.`,
    tiles: [
      { text: "§a§l+10", sub: "§7Add", icon: cropIcon(cid), onClick: change(10) },
      { text: "§a§l+50", sub: "§7Add", icon: cropIcon(cid), onClick: change(50) },
      { text: "§a§l+100", sub: "§7Add", icon: cropIcon(cid), onClick: change(100) },
      { text: "§c§l-10", sub: "§7Remove", icon: cropIcon(cid), onClick: change(-10) },
      { text: "§4§lRESET", sub: "§7Set to 0", icon: ICON.cancel, onClick: change(null) },
      {
        text: "§d§lGIVE ITEMS",
        sub: "§7Items x64",
        icon: ICON.shop,
        onClick: () => {
          try {
            const overflow = target.getComponent("minecraft:inventory").container.addItem(new ItemStack(enchantedId(cid), 64));
            if (overflow) target.dimension.spawnItem(overflow, target.location);
          } catch {}
          success(player, `Gave ${target.name} 64 ${name}.`);
          return adminCropOne(player, target, cid, `§aGave §f64 §a${name} items`);
        },
      },
      backTile(() => adminCropsPlayer(player, target)),
    ],
  });
}

async function adminHeadsMenu(player) {
  if (!player.hasTag(CONFIG.adminTag)) return;
  const tiles = world.getPlayers().map((p) => {
    const total = allHeadPoints(p).reduce((n, h) => n + h.points, 0);
    return { text: `§f${clip(p.name)}`, sub: `§d${total} heads`, icon: ICON.player, onClick: () => adminHeadsPlayer(player, p) };
  });
  tiles.push(backTile(() => adminMenu(player)));
  await tileMenu(player, {
    title: "PLAYER HEADS",
    theme: "purple",
    body: "§7Pick a player to give or take enchanted heads.\n§8Heads are per mob and upgrade that mob's spawners.",
    tiles,
  });
}

async function adminHeadsPlayer(player, target) {
  if (!target.isValid) return adminHeadsMenu(player);
  const tiles = SPAWNERS.map((sp) => ({
    text: `§f${clip(sp.name)}`,
    sub: `§d${getHeadPoints(target, sp.mob)} heads`,
    icon: mobIcon(sp.mob),
    onClick: () => adminHeadsMob(player, target, sp.mob),
  }));
  tiles.push(backTile(() => adminHeadsMenu(player)));
  await tileMenu(player, {
    title: `${clip(target.name.toUpperCase(), 16)}: HEADS`,
    theme: "purple",
    body: `§7Pick a mob to change §f${target.name}§7's heads for it.`,
    tiles: withNav(tiles.slice(0, -1), { back: () => adminHeadsMenu(player) }),
  });
}

async function adminHeadsMob(player, target, mob, msg) {
  if (!target.isValid) return adminHeadsMenu(player);
  const name = mobName(mob);
  const change = (delta) => () => {
    const now = delta === null ? 0 : Math.max(0, getHeadPoints(target, mob) + delta);
    addHeadPoints(target, mob, now - getHeadPoints(target, mob));
    success(player, `${target.name} now has ${now} ${name} heads.`);
    return adminHeadsMob(player, target, mob, `§a${target.name} now has §f${now} §a${name} heads`);
  };
  await tileMenu(player, {
    title: `${clip(name.toUpperCase(), 16)} HEADS`,
    theme: "purple",
    body: `${msg ? msg + "\n" : ""}§f${target.name}§7 has §d${getHeadPoints(target, mob)} ${name} heads§7.`,
    tiles: [
      { text: "§a§l+10", sub: "§7Add", icon: mobIcon(mob), onClick: change(10) },
      { text: "§a§l+50", sub: "§7Add", icon: mobIcon(mob), onClick: change(50) },
      { text: "§a§l+100", sub: "§7Add", icon: mobIcon(mob), onClick: change(100) },
      { text: "§c§l-10", sub: "§7Remove", icon: mobIcon(mob), onClick: change(-10) },
      { text: "§c§l-50", sub: "§7Remove", icon: mobIcon(mob), onClick: change(-50) },
      { text: "§4§lRESET", sub: "§7Set to 0", icon: ICON.cancel, onClick: change(null) },
      {
        text: "§b§lCUSTOM",
        sub: "§7Add/Remove/Set",
        icon: ICON.admin,
        onClick: async () => {
          const res = await showForm(
            player,
            new ModalFormData().title(`${name} heads: ${target.name}`).dropdown("Action", ["Add", "Remove", "Set"]).textField("Amount", "100")
          );
          if (!res || res.canceled) return adminHeadsMob(player, target, mob);
          const [action, raw] = res.formValues;
          const amount = Math.floor(Number(String(raw).replace(/[,\s]/g, "")));
          if (!Number.isFinite(amount) || amount < 0) {
            fail(player, "Enter a whole number.");
            return adminHeadsMob(player, target, mob);
          }
          const cur = getHeadPoints(target, mob);
          return change(action === 0 ? amount : action === 1 ? -amount : amount - cur)();
        },
      },
      {
        text: "§d§lGIVE ITEMS",
        sub: "§7Head items x64",
        icon: ICON.shop,
        onClick: () => {
          try {
            const overflow = target.getComponent("minecraft:inventory").container.addItem(new ItemStack(headItemId(mob), 64));
            if (overflow) target.dimension.spawnItem(overflow, target.location);
          } catch {}
          success(player, `Gave ${target.name} 64 Enchanted ${name} Heads (items).`);
          return adminHeadsMob(player, target, mob, `§aGave §f64 §aEnchanted ${name} Head items`);
        },
      },
      backTile(() => adminHeadsPlayer(player, target)),
    ],
  });
}

// What each kind of NPC opens when tapped
setNpcOpeners({
  shop: (player) => shopMenu(player),
  sell: (player) => sellMenu(player),
  menu: (player) => mainMenu(player),
});

// ============================================================================
//  CLOUDBREAK: Sky Shop (the full catalogue sorted into the Sky Shop categories)
// ============================================================================
const BRIDGING = [
  "minecraft:cobblestone", "minecraft:dirt", "minecraft:oak_planks", "minecraft:sandstone", "minecraft:netherrack",
  "minecraft:scaffolding", "minecraft:white_wool", "minecraft:stone", "minecraft:end_stone", "minecraft:obsidian",
];

function listOf(ids) {
  const { byId } = getCatalog();
  return ids.map((id) => byId.get(id)).filter((e) => e && e.buy > 0);
}

export async function skyShopMenu(player, msg) {
  const { categories, byCategory } = getCatalog();
  const cat = (id) => categories.find((c) => c.id === id);
  const back = () => skyShopMenu(player);
  const open = (title, theme, desc, items, children) =>
    itemListMenu(player, { title, theme, desc, items, searchPool: items, children, back });
  const gear = [...(byCategory.get("tools") ?? []), ...listOf(["minecraft:golden_apple", "minecraft:enchanted_golden_apple", "minecraft:arrow", "minecraft:shield"])];
  const ores = [...itemsDeep("ores"), ...itemsDeep("buckets")];
  const more = ["treasure", "redstone", "misc", "mobs", "brewing"].map(cat).filter(Boolean);
  const tiles = [
    { text: "§7§lBRIDGING BLOCKS", sub: "§7For raids", icon: "textures/blocks/cobblestone", badge: "HOT", onClick: () => open("BRIDGING BLOCKS", "blue", "Cheap blocks for building across to enemy islands.", listOf(BRIDGING)) },
    { text: "§c§lRAID GEAR", sub: "§7Armour & weapons", icon: "textures/items/diamond_sword", onClick: () => open("RAID GEAR", "red", "Armour, weapons and golden apples. No ender pearls.", gear) },
    { text: "§d§lSPAWNERS", sub: `§7${SPAWNERS.filter((s) => !s.disabled).length} mobs`, icon: U + "icon_spawners", onClick: () => spawnersMenu(player) },
    { text: "§b§lGENERATORS / ORES", sub: "§7Ores, lava & water", icon: "textures/ui/cb/icon_generator", onClick: () => open("GENERATORS / ORES", "blue", "Ores and buckets for your generator.", ores) },
    { text: "§a§lFARMING", sub: "§7Seeds & saplings", icon: U + "icon_farming", onClick: () => categoryMenu(player, cat("farming"), back) },
    { text: "§e§lBLOCKS", sub: "§7Build & decorate", icon: U + "icon_blocks", onClick: () => blocksMenu(player) },
    { text: "§6§lFOOD", sub: "§7Eat up", icon: U + "icon_food", onClick: () => categoryMenu(player, cat("food"), back) },
    { text: "§e§lMINIONS & HOPPERS", sub: "§7Work while you're away", icon: U + "icon_minion", onClick: () => tileMenu(player, {
      title: "MINIONS & HOPPERS", theme: "orange", body: balLine(player),
      tiles: [
        { text: "§e§lMINIONS", sub: "§7Mine and farm for you", icon: U + "icon_minion", onClick: () => minionShop(player) },
        { text: "§6§lCHUNK HOPPER", sub: `${priceColor(player, CHUNK_HOPPER.price)}${fmtShort(CHUNK_HOPPER.price)}`, icon: "textures/items/hopper", onClick: () => chunkHopperShop(player) },
        backTile(back),
      ],
    }) },
    { text: "§f§lMORE", sub: "§7Redstone, brewing...", icon: "textures/items/redstone_dust", onClick: () => tileMenu(player, {
      title: "MORE", theme: "blue", body: balLine(player),
      tiles: [...more.map((c) => ({ text: `§e§l${c.name.toUpperCase()}`, sub: `§7${countDeep(c.id)} items`, icon: c.icon, onClick: () => categoryMenu(player, c, back) })), backTile(back)],
    }) },
    { text: "§a§lSELL", sub: "§7Sell your loot", icon: ICON.sell, badge: "HOT", onClick: () => sellMenu(player) },
    { text: "§b§lSEARCH", sub: "§7Find any item", icon: ICON.search, onClick: () => searchMenu(player) },
  ];
  tiles.push(backTile(() => mainMenu(player)));
  await tileMenu(player, { title: "SKY SHOP", theme: "gold", body: `${msgLine(msg)}§7Pick a category    ${balLine(player)}`, tiles });
}

/** Gives a kit for free (admins). Kit items are tagged so they can't be sold. */
export function giveKit(target, kit, times = 1) {
  for (let n = 0; n < times; n++) {
    for (const i of kit.items) {
      giveItems(target, i.id, i.amount ?? 1, (stack) => {
        applyEnchants(stack, i.enchants);
        if (i.name) stack.nameTag = i.name;
        stack.setLore(["§8Kit item"]);
      });
    }
  }
}
