import { system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { AUCTION } from "./config.js";
import { fmt, fmtMoney, fmtShort, getBalance, takeMoney } from "./economy.js";
import { container, freeSlots } from "./inventory.js";
import { canTrade, deserializeItem, itemDataLines, itemDataName, itemIcon, serializeItem } from "./itemData.js";
import { creditPlayer } from "./payouts.js";
import { ICON, askAmount, backTile, fail, pagedMenu, parseAmount, showForm, success, tileMenu } from "./ui.js";

// ============================================================================
//  AUCTION HOUSE
//  Players list the item in their hand, either as BIN (Buy It Now, fixed
//  price) or as an auction (bids; the highest bid when time runs out wins).
//    - BIN: the buyer gets the item at once, the seller gets the coins.
//    - Auction: outbid players get their coins back straight away. When it
//      ends the seller is paid and the winner claims the item (My Bids).
//    - Nothing sold: the seller claims the item back (My Auctions).
//  Coins for offline players wait for them (payouts.js).
//  World data: eco:ah:<id> = { id, s, sn, item, bin, price, bid, bidder, bn, bids, end, settled }
// ============================================================================

const KEY = "eco:ah:";
const HOUR = 3600 * 1000;
const clip = (s, n = 18) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
const afterTax = (n) => Math.floor((n * (100 - AUCTION.tax)) / 100);

function read(id) {
  try {
    const raw = world.getDynamicProperty(KEY + id);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
const write = (a) => world.setDynamicProperty(KEY + a.id, JSON.stringify(a));
const remove = (a) => world.setDynamicProperty(KEY + a.id, undefined);

function all() {
  const out = [];
  for (const k of world.getDynamicPropertyIds()) {
    if (!k.startsWith(KEY)) continue;
    const a = read(k.slice(KEY.length));
    if (a) out.push(a);
  }
  return out;
}

const ended = (a) => Date.now() >= a.end;
const isLive = (a) => !ended(a);
const nextBid = (a) => (a.bids ? Math.max(a.bid + 1, Math.ceil(a.bid * (1 + AUCTION.minBidIncrease / 100))) : a.price);
const priceOf = (a) => (a.bin ? a.price : a.bids ? a.bid : a.price);

function timeLeft(a) {
  const ms = a.end - Date.now();
  if (ms <= 0) return "§cEnded";
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `§e${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `§e${h}h ${m % 60}m` : `§e${Math.floor(h / 24)}d ${h % 24}h`;
}

const CATS = [
  { id: "all", name: "All", icon: "textures/items/gold_ingot", test: () => true },
  { id: "weapons", name: "Weapons", icon: "textures/items/diamond_sword", test: (id) => /sword|bow|trident|mace|_axe$/.test(id) },
  { id: "armor", name: "Armor", icon: "textures/items/diamond_chestplate", test: (id) => /helmet|chestplate|leggings|boots|elytra|shield|turtle_helmet/.test(id) },
  { id: "tools", name: "Tools", icon: "textures/items/diamond_pickaxe", test: (id) => /pickaxe|shovel|_hoe$|fishing_rod|shears|flint_and_steel|brush/.test(id) },
  { id: "special", name: "Special", icon: "textures/items/nether_star", test: (id) => !id.startsWith("minecraft:") || id.includes("spawner") },
  { id: "misc", name: "Other", icon: "textures/items/paper", test: () => true, rest: true },
];
const catOf = (id) => CATS.find((c) => c.id !== "all" && !c.rest && c.test(id))?.id ?? "misc";

function fee(price, durIndex) {
  return Math.max(AUCTION.minFee, Math.floor((price * AUCTION.listingFee) / 100)) + (AUCTION.durationFees[durIndex] ?? 0);
}

function notify(playerId, msg) {
  const p = world.getAllPlayers().find((x) => x.id === playerId);
  if (p) {
    p.sendMessage(`§6§lAUCTION §r${msg}`);
    p.playSound("note.pling", { pitch: 1.5 });
  }
}

/** Ended auctions with bids: pay the seller (once). */
function settle() {
  for (const a of all()) {
    if (!ended(a) || a.settled || a.bin || !a.bids) continue;
    a.settled = true;
    write(a);
    creditPlayer(a.s, afterTax(a.bid), `Your auction of ${itemDataName(a.item)} sold to ${a.bn}`);
    notify(a.bidder, `§aYou won §f${itemDataName(a.item)}§a! Claim it in §fMy Bids§a.`);
  }
}

function giveStored(player, a) {
  if (freeSlots(player) < 1) {
    fail(player, "You need a free inventory slot.");
    return false;
  }
  const overflow = container(player)?.addItem(deserializeItem(a.item));
  if (overflow) player.dimension.spawnItem(overflow, player.location);
  return true;
}

// ---- actions -----------------------------------------------------------------
function buyNow(player, id) {
  const a = read(id);
  if (!a || !isLive(a)) return fail(player, "That auction has ended.");
  if (a.s === player.id) return fail(player, "You can't buy your own item.");
  if (freeSlots(player) < 1) return fail(player, "You need a free inventory slot.");
  if (!takeMoney(player, a.price)) return fail(player, `You need ${fmt(a.price)}.`);
  remove(a);
  giveStored(player, a);
  creditPlayer(a.s, afterTax(a.price), `${player.name} bought your ${itemDataName(a.item)}`);
  success(player, `Bought ${itemDataName(a.item)} for ${fmt(a.price)}.`);
}

function placeBid(player, id, amount) {
  const a = read(id);
  if (!a || !isLive(a)) return fail(player, "That auction has ended.");
  if (a.s === player.id) return fail(player, "You can't bid on your own auction.");
  if (a.bidder === player.id) return fail(player, "You're already the top bidder.");
  const min = nextBid(a);
  if (amount < min) return fail(player, `The bid must be at least ${fmt(min)}.`);
  if (!takeMoney(player, amount)) return fail(player, `You don't have ${fmt(amount)}.`);
  if (a.bids && a.bidder) {
    creditPlayer(a.bidder, a.bid, `You were outbid on ${itemDataName(a.item)} - refund`);
  }
  a.bid = amount;
  a.bidder = player.id;
  a.bn = player.name;
  a.bids = (a.bids ?? 0) + 1;
  // a late bid gives others a moment to answer
  if (a.end - Date.now() < 60000) a.end = Date.now() + 60000;
  write(a);
  notify(a.s, `§f${player.name} §7bid §a${fmt(amount)} §7on your §f${itemDataName(a.item)}`);
  success(player, `You bid ${fmt(amount)} on ${itemDataName(a.item)}.`);
}

function cancel(player, id) {
  const a = read(id);
  if (!a || a.s !== player.id) return fail(player, "That isn't your auction.");
  if (!a.bin && a.bids) return fail(player, "You can't cancel an auction that has bids.");
  if (!giveStored(player, a)) return;
  remove(a);
  success(player, `Took ${itemDataName(a.item)} off the Auction House.`);
}

// ---- menus -------------------------------------------------------------------
export async function auctionMenu(player, back) {
  settle();
  const home = () => auctionMenu(player, back);
  const list = all();
  const live = list.filter(isLive);
  const mine = list.filter((a) => a.s === player.id);
  const myBids = list.filter((a) => a.bidder === player.id);
  await tileMenu(player, {
    title: "AUCTION HOUSE",
    theme: "gold",
    body: `§7Buy and sell items with other players. Press §aCREATE§7 and pick an item from your inventory to sell it.\n§7Live auctions: §f${live.length}    §7Purse: §a${fmtMoney(getBalance(player))}`,
    tiles: [
      { text: "§6§lBROWSE", sub: `§7${live.length} listings`, icon: ICON.search, onClick: () => browseCats(player, home) },
      { text: "§a§lCREATE", sub: "§7Sell an item from your inventory", icon: ICON.sell, onClick: () => createMenu(player, home) },
      {
        text: "§e§lMY AUCTIONS",
        sub: `§7${mine.length}/${AUCTION.maxPerPlayer}`,
        icon: "textures/items/book_writable",
        badge: mine.some((a) => ended(a) && !a.bids) ? "NEW" : undefined,
        onClick: () => listMenu(player, "MY AUCTIONS", () => all().filter((a) => a.s === player.id), home),
      },
      {
        text: "§b§lMY BIDS",
        sub: `§7${myBids.length} auctions`,
        icon: "textures/items/gold_nugget",
        badge: myBids.some(ended) ? "NEW" : undefined,
        onClick: () => listMenu(player, "MY BIDS", () => all().filter((a) => a.bidder === player.id), home),
      },
      backTile(back),
    ],
  });
}

async function browseCats(player, back) {
  const live = all().filter(isLive);
  const again = () => browseCats(player, back);
  const tiles = CATS.map((c) => {
    const n = live.filter((a) => c.id === "all" || catOf(a.item.id) === c.id).length;
    return { text: `§e§l${c.name.toUpperCase()}`, sub: `§7${n} listings`, icon: c.icon, onClick: () => browse(player, c.id, "low", undefined, again) };
  });
  tiles.push({
    text: "§b§lSEARCH",
    sub: "§7By item name",
    icon: ICON.search,
    onClick: async () => {
      const res = await showForm(player, new ModalFormData().title("Search auctions").textField("Item name", "e.g. sword"));
      const q = String(res?.formValues?.[0] ?? "").trim().toLowerCase();
      return q ? browse(player, "all", "low", q, again) : again();
    },
  });
  tiles.push(backTile(back));
  await tileMenu(player, { title: "BROWSE", theme: "gold", body: "§7Pick a category.", tiles });
}

async function browse(player, cat, sort, query, back) {
  const again = () => browse(player, cat, sort, query, back);
  let list = all().filter(isLive);
  if (cat !== "all") list = list.filter((a) => catOf(a.item.id) === cat);
  if (query) list = list.filter((a) => (itemDataName(a.item) + " " + a.item.id).toLowerCase().includes(query));
  const sorts = {
    low: ["Lowest price", (x, y) => priceOf(x) - priceOf(y)],
    high: ["Highest price", (x, y) => priceOf(y) - priceOf(x)],
    end: ["Ending soon", (x, y) => x.end - y.end],
    bin: ["BIN only", (x, y) => priceOf(x) - priceOf(y)],
  };
  if (sort === "bin") list = list.filter((a) => a.bin);
  list.sort(sorts[sort][1]);
  const order = Object.keys(sorts);
  const nextSort = order[(order.indexOf(sort) + 1) % order.length];
  const tiles = [
    {
      text: "§d§lSORT",
      sub: `§7${sorts[sort][0]}`,
      icon: "textures/items/hopper",
      onClick: () => browse(player, cat, nextSort, query, back),
    },
    ...list.map((a) => auctionTile(player, a, again)),
  ];
  await pagedMenu(player, {
    title: query ? `AUCTIONS: "${clip(query, 10).toUpperCase()}"` : `AUCTIONS - ${CATS.find((c) => c.id === cat).name.toUpperCase()}`,
    theme: "gold",
    body: list.length ? `§7${list.length} listings. Tap one to see it.` : "§7Nothing listed here right now.",
    tiles,
    back,
  });
}

function auctionTile(player, a, back) {
  const name = itemDataName(a.item);
  const amt = a.item.n > 1 ? `§7${a.item.n}x ` : "";
  return {
    text: `${a.item.ench?.length ? "§b" : "§f"}${clip(amt.replace(/§./g, "") + name)}`,
    sub: `${a.bin ? "§6" : "§a"}${fmtShort(priceOf(a))} ${timeLeft(a)}`,
    icon: itemIcon(a.item.id),
    badge: a.bin ? "HOT" : undefined,
    onClick: () => viewAuction(player, a.id, back),
  };
}

async function listMenu(player, title, fetch, back) {
  const again = () => listMenu(player, title, fetch, back);
  const list = fetch().sort((x, y) => x.end - y.end);
  await pagedMenu(player, {
    title,
    theme: "gold",
    body: list.length ? "§7Tap one to view, claim or cancel it." : "§7Nothing here.",
    tiles: list.map((a) => auctionTile(player, a, again)),
    back,
  });
}

async function viewAuction(player, id, back) {
  settle();
  const a = read(id);
  if (!a) {
    fail(player, "That auction is gone.");
    return back();
  }
  const again = () => viewAuction(player, id, back);
  const name = itemDataName(a.item);
  const mine = a.s === player.id;
  const lines = [`§f§l${a.item.n > 1 ? a.item.n + "x " : ""}${name}§r`, ...itemDataLines(a.item).slice(0, 8), ""];
  lines.push(`§7Seller: §f${a.sn}    §7Time left: ${timeLeft(a)}`);
  if (a.bin) lines.push(`§7Buy It Now: §6§l${fmt(a.price)}`);
  else {
    lines.push(a.bids ? `§7Top bid: §a§l${fmt(a.bid)} §r§7by §f${a.bn} §8(${a.bids} bids)` : `§7Starting bid: §a${fmt(a.price)}`);
    if (isLive(a)) lines.push(`§7Next bid: §e${fmt(nextBid(a))}`);
  }
  const tiles = [];
  if (isLive(a) && !mine) {
    if (a.bin) {
      tiles.push({
        text: "§6§lBUY NOW",
        sub: `${getBalance(player) >= a.price ? "§a" : "§c"}${fmtShort(a.price)}`,
        icon: ICON.confirm,
        onClick: () => {
          buyNow(player, id);
          return back();
        },
      });
    } else if (a.bidder !== player.id) {
      const min = nextBid(a);
      tiles.push({
        text: "§a§lBID",
        sub: `§a${fmtShort(min)}`,
        icon: ICON.confirm,
        onClick: () => {
          placeBid(player, id, min);
          return again();
        },
      });
      tiles.push({
        text: "§b§lCUSTOM BID",
        sub: "§7Type amount",
        icon: ICON.pay,
        onClick: async () => {
          const n = await askAmount(player, "Place a bid", `Your bid (at least ${fmt(min)})`);
          if (n !== undefined) placeBid(player, id, n);
          return again();
        },
      });
    }
  }
  if (ended(a) && a.bidder === player.id) {
    tiles.push({
      text: "§a§lCLAIM ITEM",
      sub: "§7You won!",
      icon: ICON.confirm,
      badge: "NEW",
      onClick: () => {
        settle();
        const cur = read(id);
        if (cur && cur.bidder === player.id && giveStored(player, cur)) {
          remove(cur);
          success(player, `Claimed ${name}.`);
        }
        return back();
      },
    });
  }
  if (mine && (a.bin || !a.bids)) {
    tiles.push({
      text: ended(a) ? "§e§lCLAIM BACK" : "§c§lCANCEL",
      sub: ended(a) ? "§7It didn't sell" : "§7Take it back",
      icon: ICON.cancel,
      onClick: () => {
        cancel(player, id);
        return back();
      },
    });
  }
  if (mine && ended(a) && a.bids) lines.push("§aSold! The coins were added to your purse.");
  tiles.push(backTile(back));
  await tileMenu(player, { title: a.bin ? "BIN AUCTION" : "AUCTION", theme: "gold", body: lines.join("\n"), tiles });
}

/** Lists the items in the player's inventory that can be auctioned. */
async function pickAuctionItem(player, back) {
  const inv = container(player);
  const again = () => pickAuctionItem(player, back);
  const tiles = [];
  for (let i = 0; i < (inv?.size ?? 0); i++) {
    const it = inv.getItem(i);
    if (!it || !canTrade(it)) continue;
    const d = serializeItem(it);
    tiles.push({
      text: `${d.ench?.length ? "§b" : "§f"}${itemDataName(d)}`,
      sub: [`§7x${d.n}`, ...itemDataLines(d).slice(0, 6), i < 9 ? `§8Hotbar slot ${i + 1}` : "§8Inventory"].join("\n"),
      icon: itemIcon(d.id),
      onClick: () => createMenu(player, again, i),
    });
  }
  tiles.push(backTile(back));
  return tileMenu(player, {
    title: "Create Auction - Pick an Item",
    theme: "gold",
    body: tiles.length > 1 ? "§7Pick the item you want to sell. The whole stack is listed." : "§cYou have nothing that can be auctioned. §8(Kit items and the menu compass can't be sold.)",
    tiles,
  });
}

async function createMenu(player, back, slot) {
  if (slot === undefined) return pickAuctionItem(player, back);
  const inv = container(player);
  const held = inv?.getItem(slot);
  if (!held) {
    fail(player, "That item isn't there any more - pick it again.");
    return back();
  }
  if (!canTrade(held)) {
    fail(player, "That item can't be sold on the Auction House.");
    return back();
  }
  if (all().filter((a) => a.s === player.id).length >= AUCTION.maxPerPlayer) {
    fail(player, `You can only have ${AUCTION.maxPerPlayer} auctions. Claim or cancel some first.`);
    return back();
  }
  const data = serializeItem(held);
  const name = itemDataName(data);
  const res = await showForm(
    player,
    new ModalFormData()
      .title(`Sell ${data.n}x ${name}`)
      .dropdown("Type", ["BIN (Buy It Now - fixed price)", "Auction (players bid)"], { defaultValueIndex: 0 })
      .textField("Price (BIN) or starting bid - you can use k / m / b", "e.g. 25k", { defaultValue: "1000" })
      .dropdown(
        "Duration",
        AUCTION.durations.map((h, i) => `${h} hour${h > 1 ? "s" : ""}${AUCTION.durationFees[i] ? ` (+${fmt(AUCTION.durationFees[i])} fee)` : ""}`),
        { defaultValueIndex: Math.min(3, AUCTION.durations.length - 1) }
      )
  );
  if (!res || res.canceled) return back();
  const bin = res.formValues[0] === 0;
  const price = parseAmount(res.formValues[1]);
  const durIndex = Number(res.formValues[2]) || 0;
  if (!Number.isFinite(price) || price <= 0) {
    fail(player, "Enter a price above 0.");
    return back();
  }
  const cost = fee(price, durIndex);
  const ok = await tileMenu(player, {
    title: "CONFIRM LISTING",
    theme: "gold",
    body: [
      `§f§l${data.n}x ${name}`,
      ...itemDataLines(data).slice(0, 5),
      "",
      `§7Type: §f${bin ? "BIN" : "Auction"}    §7${bin ? "Price" : "Starting bid"}: §a${fmt(price)}`,
      `§7Duration: §f${AUCTION.durations[durIndex]}h    §7Listing fee: §c${fmt(cost)}`,
      `§8${AUCTION.tax}% tax is taken from the coins you get when it sells.`,
    ].join("\n"),
    tiles: [
      { text: "§a§lLIST IT", sub: `§c-${fmtShort(cost)} fee`, icon: ICON.confirm, id: "yes" },
      { text: "§c§lCANCEL", sub: "§7Keep the item", icon: ICON.cancel },
    ],
  });
  if (ok?.id !== "yes") return back();
  // make sure the item is still in that slot
  const now = inv.getItem(slot);
  if (!now || now.typeId !== data.id || now.amount !== data.n || JSON.stringify(serializeItem(now)) !== JSON.stringify(data)) {
    fail(player, "That item moved or changed - pick it again.");
    return back();
  }
  if (!takeMoney(player, cost)) {
    fail(player, `You need ${fmt(cost)} for the listing fee.`);
    return back();
  }
  inv.setItem(slot, undefined);
  write({
    id: newId(),
    s: player.id,
    sn: player.name,
    item: data,
    bin,
    price,
    bid: 0,
    bids: 0,
    end: Date.now() + AUCTION.durations[durIndex] * HOUR,
  });
  success(player, `Listed ${data.n}x ${name} for ${fmt(price)}${bin ? " (BIN)" : " (starting bid)"}.`);
  return back();
}

export function registerAuctions() {
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(settle, 400)); // every 20 seconds
}

