import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { filterItems, getCatalog, itemsDeep, search, sellPrice } from "./catalog.js";
import { BADGES, CONFIG, KITS, SHOP_LAYOUT, SPAWNERS } from "./config.js";
import { addMoney, fmt, fmtShort, getBalance, rankOf, setBalance, takeMoney, topBalances } from "./economy.js";
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
import { editItemMenu, editorMenu } from "./editor.js";
import { clearGroundItems } from "./groundItems.js";
import { allHeadPoints, countHeads, depositHeads, makeSpawnerItem, mobIcon, mobName } from "./spawners.js";
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

const balLine = (player) => `§7Balance: §a${fmt(getBalance(player))}`;
const msgLine = (msg) => (msg ? `${msg}\n` : "");
const priceColor = (player, cost) => (getBalance(player) >= cost ? "§a" : "§c");

// ============================================================================
//  MAIN COMPASS MENU
// ============================================================================
export async function mainMenu(player) {
  const bal = getBalance(player);
  const tiles = [
    { text: "§6§lSHOP", sub: "§7Buy items", icon: ICON.shop, onClick: () => shopMenu(player) },
    { text: "§a§lSELL", sub: "§7Sell your loot", icon: ICON.sell, onClick: () => sellMenu(player) },
    { text: "§e§lBALANCE", sub: `§a${fmtShort(bal)}`, icon: ICON.bank, onClick: () => balanceMenu(player) },
    { text: "§b§lPAY", sub: "§7Send money", icon: ICON.pay, onClick: () => payMenu(player, () => mainMenu(player)) },
    { text: "§6§lBALTOP", sub: "§7Richest players", icon: ICON.top, onClick: () => topMenu(player, () => mainMenu(player)) },
  ];
  if (player.hasTag(CONFIG.adminTag)) {
    tiles.push({ text: "§c§lADMIN", sub: "§7Settings & tools", icon: ICON.admin, onClick: () => adminMenu(player) });
  }
  await tileMenu(player, {
    title: "SKYBLOCK MENU",
    theme: "blue",
    body: `§7Welcome back, §f${player.name}§7!    ${balLine(player)}`,
    tiles,
  });
}

// ============================================================================
//  SHOP
// ============================================================================
export async function shopMenu(player, msg) {
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
    fail(player, `You need ${fmt(cost)} but only have ${fmt(getBalance(player))}.`);
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

async function kitsMenu(player) {
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
  const sellable = [...countPlain(player)].filter(([id]) => sellPrice(id) > 0);
  sellable.sort((a, b) => sellPrice(b[0]) * b[1] - sellPrice(a[0]) * a[1]);
  const total = sellable.reduce((sum, [id, n]) => sum + sellPrice(id) * n, 0);

  const tiles = [];
  if (sellable.length) {
    tiles.push({
      text: "§a§lSELL ALL",
      sub: `§a${fmtShort(total)}`,
      icon: ICON.sell,
      badge: "HOT",
      onClick: () => {
        let earned = 0;
        for (const [id] of sellable) earned += sellPrice(id) * removeAllPlain(player, id);
        addMoney(player, earned);
        success(player, `Sold everything for ${fmt(earned)}.`);
        return sellMenu(player, `§aSold everything for §f${fmt(earned)}§a!`);
      },
    });
  }
  // Enchanted heads go into that mob's head balance, not money
  const heads = [...countHeads(player)];
  if (heads.length) {
    tiles.push({
      text: "§d§lSELL HEADS",
      sub: `§7${heads.reduce((s, [, n]) => s + n, 0)} heads`,
      icon: mobIcon(heads[0][0]),
      onClick: () => {
        const done = depositHeads(player);
        const list = [...done].map(([m, n]) => `${n} ${mobName(m)}`).join(", ");
        success(player, `Added heads to your head balance: ${list}`);
        return sellMenu(player, `§dAdded to head balance: §f${list}`);
      },
    });
    for (const [mob, n] of heads) {
      tiles.push({
        text: `§d${clip(mobName(mob) + " Head")}`,
        sub: `§7x${n} §d+${n} heads`,
        icon: mobIcon(mob),
        onClick: () => {
          const got = depositHeads(player, mob).get(mob) ?? 0;
          success(player, `Added ${got} ${mobName(mob)} heads to your head balance.`);
          return sellMenu(player, `§dAdded §f${got} ${mobName(mob)} §dheads to your head balance`);
        },
      });
    }
  }
  for (const [id, n] of sellable.slice(0, 40)) {
    const e = byId.get(id);
    tiles.push({
      text: `§f${clip(e?.name ?? pretty(id))}`,
      sub: `§7x${n} §a${fmtShort(sellPrice(id) * n)}`,
      icon: e?.icon ?? ICON.coin,
      onClick: () => {
        const sold = removeAllPlain(player, id);
        const earned = sold * sellPrice(id);
        addMoney(player, earned);
        success(player, `Sold ${sold}x ${e?.name ?? pretty(id)} for ${fmt(earned)}.`);
        return sellMenu(player, `§aSold §f${sold}x ${e?.name ?? pretty(id)} §afor §f${fmt(earned)}`);
      },
    });
  }
  tiles.push(backTile(() => mainMenu(player)));

  const info = sellable.length || heads.length
    ? "§7Click an item to sell all of it. §dHeads §7go to your head balance."
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
    body: `§7Your balance: §a§l${fmt(getBalance(player))}§r\n§7Leaderboard rank: §6${rank ? "#" + rank : "-"}`,
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

async function payMenu(player, back) {
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
async function adminMenu(player) {
  if (!player.hasTag(CONFIG.adminTag)) return;
  const tiles = world.getPlayers().map((p) => ({
    text: `§f${p.name}`,
    sub: `§a${fmtShort(getBalance(p))}`,
    icon: ICON.player,
    onClick: () => adminPlayerMenu(player, p),
  }));
  tiles.push({
    text: "§b§lSETTINGS",
    sub: "§7Spawners, kits...",
    icon: ICON.admin,
    onClick: () => settingsMenu(player, () => adminMenu(player)),
  });
  tiles.push({
    text: "§6§lSHOP EDITOR",
    sub: "§7Move/hide items",
    icon: ICON.shop,
    onClick: () => editorMenu(player, () => adminMenu(player)),
  });
  tiles.push({
    text: "§c§lCLEAR ITEMS",
    sub: "§7Remove floor items",
    icon: ICON.cancel,
    onClick: () => {
      const n = clearGroundItems();
      success(player, `Removed ${n} dropped item piles.`);
      return adminMenu(player);
    },
  });
  tiles.push({
    text: "§e§lCOMPASS",
    sub: "§7Give to all",
    icon: ICON.confirm,
    onClick: () => {
      for (const p of world.getPlayers()) giveCompass(p, CONFIG.compass.slot);
      success(player, "Gave a menu compass to everyone who was missing one.");
      return adminMenu(player);
    },
  });
  tiles.push(backTile(() => mainMenu(player)));
  await tileMenu(player, {
    title: "ADMIN PANEL",
    theme: "red",
    body: "§7Pick a player to manage their money.\n§8Tip: /scoreboard players add <name> money <amount> also works",
    tiles,
  });
}

async function adminPlayerMenu(player, target, msg) {
  if (!target.isValid) return adminMenu(player);
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
        if (!target.isValid) return adminMenu(player);
        const now =
          action === 0 ? addMoney(target, amount) : action === 1 ? addMoney(target, -amount) : setBalance(target, amount);
        success(player, `${target.name} now has ${fmt(now)}.`);
        return adminPlayerMenu(player, target, `§a${target.name} now has §f${fmt(now)}`);
      },
    },
    backTile(() => adminMenu(player)),
  ];
  await tileMenu(player, {
    title: target.name.toUpperCase(),
    theme: "red",
    body: `${msgLine(msg)}§7Balance of §f${target.name}§7: §a${fmt(getBalance(target))}`,
    tiles,
  });
}
