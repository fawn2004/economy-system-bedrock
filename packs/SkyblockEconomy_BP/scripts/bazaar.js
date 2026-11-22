import { ItemTypes, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { getCatalog, sellPrice } from "./catalog.js";
import { BAZAAR, CROPS, MINION_TYPES, SPAWNERS } from "./config.js";
import { addMoney, fmt, fmtMoney, getBalance, takeMoney } from "./economy.js";
import { countPlain, giveItems, removePlain, spaceFor } from "./inventory.js";
import { lootIcon, lootIdFor, lootName } from "./minions.js";
import { headItemId, mobIcon, mobName } from "./spawners.js";
import { cropIcon, cropName, enchantedId } from "./tools.js";
import { mayorIs } from "./mayor.js";
import { ICON, backTile, fail, pagedMenu, parseAmount, showForm, success, tileMenu } from "./ui.js";

// ============================================================================
//  BAZAAR
//  A player-run market for raw materials. Each product has an order book:
//    - Sell offers ("I'll sell N at $x each")  - items are taken when posted
//    - Buy orders  ("I'll buy N at $x each")   - coins are taken when posted
//  Instant Buy fills the cheapest sell offers, Instant Sell fills the highest
//  buy orders. A new order that crosses the book fills straight away at the
//  price already waiting there. Owners claim what their orders bought/sold
//  in Manage Orders (works while they're offline).
//
//  Prices are stored in tenths of a coin (pt), so $0.5 cobblestone works.
//  World data: eco:bz:<item id> = { b: [buy orders], s: [sell offers] }
//  Order: { o: id, p: player id, n: name, pt, a: amount, f: filled, c: claimed,
//           esc: escrow left (buy, tenths), e: earned (sell, tenths), ce: earned claimed, t: time }
// ============================================================================

const KEY = "eco:bz:";
const tenths = (n) => Math.round(n * 10);
const money = (pt) => {
  const v = pt / 10;
  return Number.isInteger(v) ? fmt(v) : fmt(Math.floor(v)) + "." + Math.round((v % 1) * 10);
};
const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const clip = (s, n = 18) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const pretty = (id) => id.replace(/^[a-z_]+:/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const tax = () => BAZAAR.tax * (mayorIs("sable") ? 0.5 : 1);
const afterTax = (t) => Math.floor((t * (100 - tax())) / 100);
const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);

// ---- products ----------------------------------------------------------------
let products; // { cats: [{ id, name, icon, items: [product] }], byId: Map }

const exists = (id) => {
  try {
    return !!ItemTypes.get(id);
  } catch {
    return false;
  }
};

function productInfo(id) {
  const e = getCatalog().byId.get(id) ?? getCatalog().all.get(id);
  if (e) return { id, name: e.name, icon: e.icon, npc: e.sell };
  return { id, name: pretty(id), icon: "textures/items/" + id.replace(/^minecraft:/, ""), npc: sellPrice(id) };
}

function getProducts() {
  if (products) return products;
  const byId = new Map();
  const cats = [];
  for (const c of BAZAAR.categories) {
    const items = [];
    const add = (p) => {
      if (!exists(p.id) || byId.has(p.id)) return;
      byId.set(p.id, p);
      items.push(p);
    };
    for (const id of c.items) add(productInfo(id));
    if (c.id === "enchanted") {
      for (const t of MINION_TYPES)
        for (const tier of t.tiers) {
          const id = lootIdFor(tier.drop[0]);
          add({ id, name: lootName(id), icon: lootIcon(id), npc: 0 });
        }
      for (const crop of CROPS) add({ id: enchantedId(crop.id), name: "Enchanted " + crop.name, icon: cropIcon(crop.id), npc: 0 });
      for (const sp of SPAWNERS) add({ id: headItemId(sp.mob), name: mobName(sp.mob) + " Head", icon: mobIcon(sp.mob), npc: 0 });
    }
    cats.push({ id: c.id, name: c.name, icon: c.icon, items });
  }
  products = { cats, byId };
  return products;
}

// ---- order books -------------------------------------------------------------
function readBook(id) {
  try {
    const raw = world.getDynamicProperty(KEY + id);
    if (typeof raw === "string") {
      const b = JSON.parse(raw);
      return { b: b.b ?? [], s: b.s ?? [] };
    }
  } catch {}
  return { b: [], s: [] };
}

function writeBook(id, book) {
  const done = (o) => o.f >= o.a && o.c >= o.f && (o.e ?? 0) <= (o.ce ?? 0) && !(o.esc > 0);
  book.b = book.b.filter((o) => !done(o));
  book.s = book.s.filter((o) => !done(o));
  world.setDynamicProperty(KEY + id, book.b.length || book.s.length ? JSON.stringify(book) : undefined);
}

const open = (o) => o.a - o.f;
const sellsAsc = (book) => book.s.filter((o) => open(o) > 0).sort((x, y) => x.pt - y.pt || x.t - y.t);
const buysDesc = (book) => book.b.filter((o) => open(o) > 0).sort((x, y) => y.pt - x.pt || x.t - y.t);

/** Best (lowest) sell offer and best (highest) buy order, in tenths. */
export function quotes(id) {
  const book = readBook(id);
  return { sell: sellsAsc(book)[0]?.pt, buy: buysDesc(book)[0]?.pt };
}

/** Price levels: [{ pt, amount, orders }] */
function depth(list) {
  const out = [];
  for (const o of list) {
    const last = out[out.length - 1];
    if (last && last.pt === o.pt) {
      last.amount += open(o);
      last.orders++;
    } else out.push({ pt: o.pt, amount: open(o), orders: 1 });
  }
  return out;
}

function notify(playerId, msg) {
  const p = world.getAllPlayers().find((x) => x.id === playerId);
  if (p) {
    p.sendMessage(`§6§lBAZAAR §r${msg}`);
    p.playSound("note.pling", { pitch: 1.5 });
  }
}

/** Every order (both sides, every product) placed by this player. */
function ordersOf(playerId) {
  const out = [];
  for (const k of world.getDynamicPropertyIds()) {
    if (!k.startsWith(KEY)) continue;
    const id = k.slice(KEY.length);
    const book = readBook(id);
    for (const o of book.b) if (o.p === playerId) out.push({ ...o, side: "b", item: id });
    for (const o of book.s) if (o.p === playerId) out.push({ ...o, side: "s", item: id });
  }
  return out.sort((x, y) => y.t - x.t);
}

const activeOrderCount = (playerId) => ordersOf(playerId).length;

// ---- trading -----------------------------------------------------------------
/** Cost (tenths) to instantly buy `amount`, and how many are available. */
function previewBuy(player, id, amount) {
  let left = amount, cost = 0;
  for (const o of sellsAsc(readBook(id))) {
    if (o.p === player.id) continue;
    const k = Math.min(left, open(o));
    cost += k * o.pt;
    left -= k;
    if (!left) break;
  }
  return { got: amount - left, cost };
}

function instantBuy(player, p, amount) {
  amount = Math.min(amount, spaceFor(player, p.id));
  if (amount <= 0) return fail(player, "You have no room in your inventory.");
  const { got, cost } = previewBuy(player, p.id, amount);
  if (!got) return fail(player, "Nobody is selling that right now.");
  const coins = Math.ceil(cost / 10);
  if (!takeMoney(player, coins)) return fail(player, `You need ${fmt(coins)} for that.`);
  const book = readBook(p.id);
  let left = got;
  for (const o of sellsAsc(book)) {
    if (o.p === player.id) continue;
    const k = Math.min(left, open(o));
    o.f += k;
    o.c += k; // the items were already taken from the seller
    o.e = (o.e ?? 0) + k * o.pt;
    left -= k;
    notify(o.p, `§7Your sell offer for §f${p.name} §7filled §a${commas(o.f)}§7/§f${commas(o.a)}`);
    if (!left) break;
  }
  writeBook(p.id, book);
  giveItems(player, p.id, got);
  success(player, `Bought ${commas(got)}x ${p.name} for ${fmt(coins)}.`);
}

function instantSell(player, p, amount) {
  const have = countPlain(player).get(p.id) ?? 0;
  amount = Math.min(amount, have);
  if (amount <= 0) return fail(player, `You don't have any ${p.name}.`);
  const book = readBook(p.id);
  let left = amount, earned = 0;
  const fills = [];
  for (const o of buysDesc(book)) {
    if (o.p === player.id) continue;
    const k = Math.min(left, open(o));
    fills.push([o, k]);
    earned += k * o.pt;
    left -= k;
    if (!left) break;
  }
  const sold = amount - left;
  if (!sold) return fail(player, "Nobody has a buy order for that right now.");
  const removed = removePlain(player, p.id, sold);
  if (removed < sold) {
    giveItems(player, p.id, removed); // inventory changed under us - undo
    return fail(player, "Your inventory changed, try again.");
  }
  for (const [o, k] of fills) {
    o.f += k;
    o.esc -= k * o.pt;
    notify(o.p, `§7Your buy order for §f${p.name} §7filled §a${commas(o.f)}§7/§f${commas(o.a)} §8- claim it in Manage Orders`);
  }
  writeBook(p.id, book);
  const coins = Math.floor(afterTax(earned) / 10);
  addMoney(player, coins);
  success(player, `Sold ${commas(sold)}x ${p.name} for ${fmt(coins)}${tax() ? ` (after ${tax()}% tax)` : ""}.`);
}

function canPlace(player, book, side) {
  if (activeOrderCount(player.id) >= BAZAAR.maxOrdersPerPlayer) {
    fail(player, `You can only have ${BAZAAR.maxOrdersPerPlayer} orders at once. Claim or cancel some in Manage Orders.`);
    return false;
  }
  if (book[side].length >= BAZAAR.maxOrdersPerProduct) {
    fail(player, "This product's order book is full right now. Try again later.");
    return false;
  }
  return true;
}

function placeBuyOrder(player, p, amount, pt) {
  const book = readBook(p.id);
  if (!canPlace(player, book, "b")) return;
  const coins = Math.ceil((amount * pt) / 10);
  if (!takeMoney(player, coins)) return fail(player, `You need ${fmt(coins)} for that order.`);
  const order = { o: newId(), p: player.id, n: player.name, pt, a: amount, f: 0, c: 0, esc: coins * 10, t: Date.now() };
  // fill straight away from sell offers at or below our price
  for (const s of sellsAsc(book)) {
    if (s.pt > pt || !open(order)) break;
    if (s.p === player.id) continue;
    const k = Math.min(open(order), open(s));
    s.f += k;
    s.c += k;
    s.e = (s.e ?? 0) + k * s.pt;
    order.f += k;
    order.esc -= k * s.pt;
    notify(s.p, `§7Your sell offer for §f${p.name} §7filled §a${commas(s.f)}§7/§f${commas(s.a)}`);
  }
  book.b.push(order);
  writeBook(p.id, book);
  success(player, `Buy order placed: ${commas(amount)}x ${p.name} at ${money(pt)} each${order.f ? ` (${commas(order.f)} filled already - claim them in Manage Orders)` : ""}.`);
}

function placeSellOffer(player, p, amount, pt) {
  const book = readBook(p.id);
  if (!canPlace(player, book, "s")) return;
  const removed = removePlain(player, p.id, amount);
  if (removed < amount) {
    giveItems(player, p.id, removed);
    return fail(player, `You don't have ${commas(amount)}x ${p.name}.`);
  }
  const order = { o: newId(), p: player.id, n: player.name, pt, a: amount, f: 0, c: 0, e: 0, ce: 0, t: Date.now() };
  for (const b of buysDesc(book)) {
    if (b.pt < pt || !open(order)) break;
    if (b.p === player.id) continue;
    const k = Math.min(open(order), open(b));
    b.f += k;
    b.esc -= k * b.pt;
    order.f += k;
    order.c += k;
    order.e += k * b.pt; // sold at the buyer's (higher) price
    notify(b.p, `§7Your buy order for §f${p.name} §7filled §a${commas(b.f)}§7/§f${commas(b.a)} §8- claim it in Manage Orders`);
  }
  book.s.push(order);
  writeBook(p.id, book);
  success(player, `Sell offer placed: ${commas(amount)}x ${p.name} at ${money(pt)} each${order.f ? ` (${commas(order.f)} sold already - claim the coins in Manage Orders)` : ""}.`);
}

/** Claims everything an order has ready. Returns a short description. */
function claimOrder(player, item, orderId, cancel = false) {
  const book = readBook(item);
  const p = getProducts().byId.get(item) ?? productInfo(item);
  const o = [...book.b, ...book.s].find((x) => x.o === orderId);
  if (!o || o.p !== player.id) return undefined;
  const parts = [];
  if (book.b.includes(o)) {
    const ready = o.f - o.c;
    const give = Math.min(ready, spaceFor(player, item));
    if (give > 0) {
      giveItems(player, item, give);
      o.c += give;
      parts.push(`${commas(give)}x ${p.name}`);
    }
    if (give < ready) parts.push(`§c(${commas(ready - give)} left - no room)§r`);
    if (cancel) {
      o.a = o.f; // nothing more can fill
      const back = Math.floor(o.esc / 10);
      o.esc = 0;
      if (back > 0) {
        addMoney(player, back);
        parts.push(`${fmt(back)} refunded`);
      }
    } else if (open(o) === 0 && o.esc > 0) {
      // filled below the order price: return the change
      const back = Math.floor(o.esc / 10);
      o.esc = 0;
      if (back > 0) {
        addMoney(player, back);
        parts.push(`${fmt(back)} change`);
      }
    }
  } else {
    const coins = Math.floor(afterTax((o.e ?? 0) - (o.ce ?? 0)) / 10);
    o.ce = o.e ?? 0;
    if (coins > 0) {
      addMoney(player, coins);
      parts.push(fmt(coins));
    }
    if (cancel) {
      const back = open(o);
      if (back > 0) giveItems(player, item, back);
      o.a = o.f;
      if (back > 0) parts.push(`${commas(back)}x ${p.name} returned`);
    }
  }
  writeBook(item, book);
  return parts.join(", ");
}

// ---- menus -------------------------------------------------------------------
export async function bazaarMenu(player, back) {
  const { cats } = getProducts();
  const mine = ordersOf(player.id);
  const ready = mine.filter((o) => (o.side === "b" ? o.f > o.c : (o.e ?? 0) > (o.ce ?? 0))).length;
  const home = () => bazaarMenu(player, back);
  const tiles = cats
    .filter((c) => c.items.length)
    .map((c) => ({ text: `§e§l${c.name.toUpperCase()}`, sub: `§7${c.items.length} products`, icon: c.icon, onClick: () => categoryMenu(player, c, home) }));
  tiles.push({
    text: "§b§lMANAGE ORDERS",
    sub: ready ? `§a${ready} ready to claim` : `§7${mine.length}/${BAZAAR.maxOrdersPerPlayer} orders`,
    icon: "textures/items/book_writable",
    badge: ready ? "NEW" : undefined,
    onClick: () => manageMenu(player, home),
  });
  tiles.push({
    text: "§b§lSEARCH",
    sub: "§7Find a product",
    icon: ICON.search,
    onClick: async () => {
      const res = await showForm(player, new ModalFormData().title("Search Bazaar").textField("Product name", "e.g. diamond"));
      const q = String(res?.formValues?.[0] ?? "").trim().toLowerCase();
      if (!q) return home();
      const found = [...getProducts().byId.values()].filter((p) => p.name.toLowerCase().includes(q));
      return categoryMenu(player, { name: `"${q}"`, items: found }, home);
    },
  });
  tiles.push(backTile(back));
  await tileMenu(player, {
    title: "BAZAAR",
    theme: "orange",
    body: `§7Trade materials with other players. Post §aBuy Orders§7 and §6Sell Offers§7, or buy and sell instantly at the best price.\n§7Purse: §a${fmtMoney(getBalance(player))}`,
    tiles,
  });
}

async function categoryMenu(player, cat, back) {
  const again = () => categoryMenu(player, cat, back);
  const tiles = cat.items.map((p) => {
    const q = quotes(p.id);
    const parts = [];
    parts.push(q.sell !== undefined ? `§6${money(q.sell)}` : "§8-");
    parts.push(q.buy !== undefined ? `§a${money(q.buy)}` : "§8-");
    return { text: `§f${clip(p.name)}`, sub: parts.join(" §7/ "), icon: p.icon, onClick: () => productMenu(player, p, again) };
  });
  await pagedMenu(player, {
    title: `BAZAAR - ${cat.name.toUpperCase()}`,
    theme: "orange",
    body: tiles.length ? "§6Buy price §7/ §aSell price §8(best offer / best order)" : "§7No products found.",
    tiles,
    back,
  });
}

async function askOrder(player, p, side, suggestPt, maxAmount) {
  const form = new ModalFormData()
    .title(side === "b" ? `Buy Order: ${p.name}` : `Sell Offer: ${p.name}`)
    .textField(`Amount (max ${commas(maxAmount)})`, "e.g. 64", { defaultValue: side === "s" ? String(maxAmount) : "64" })
    .textField("Price each (decimals like 0.5 are fine)", "e.g. 2.5", { defaultValue: String(suggestPt / 10) });
  const res = await showForm(player, form);
  if (!res || res.canceled) return undefined;
  const amount = parseAmount(res.formValues[0]);
  const price = Number(String(res.formValues[1]).replace(/[,$\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount) {
    fail(player, `Amount must be 1 - ${commas(maxAmount)}.`);
    return undefined;
  }
  const pt = tenths(price);
  if (!Number.isFinite(pt) || pt < 1) {
    fail(player, "Price must be at least 0.1.");
    return undefined;
  }
  return { amount, pt };
}

async function productMenu(player, p, back, msg) {
  const again = (m) => productMenu(player, p, back, m);
  const book = readBook(p.id);
  const sells = depth(sellsAsc(book)).slice(0, 5);
  const buys = depth(buysDesc(book)).slice(0, 5);
  const have = countPlain(player).get(p.id) ?? 0;
  const lines = [];
  if (msg) lines.push(msg);
  lines.push(`§7You have: §f${commas(have)}    §7Purse: §a${fmtMoney(getBalance(player))}${p.npc ? `    §7NPC sell: §e${fmt(p.npc)}` : ""}`);
  lines.push("§6§lSELL OFFERS §r§8(you buy at)");
  lines.push(sells.length ? sells.map((l) => `§6${money(l.pt)} §7x${commas(l.amount)} §8(${l.orders})`).join("§8, ") : "§8None");
  lines.push("§a§lBUY ORDERS §r§8(you sell at)");
  lines.push(buys.length ? buys.map((l) => `§a${money(l.pt)} §7x${commas(l.amount)} §8(${l.orders})`).join("§8, ") : "§8None");

  const bestSell = sells[0]?.pt, bestBuy = buys[0]?.pt;
  const tiles = [
    {
      text: "§6§lINSTANT BUY",
      sub: bestSell !== undefined ? `§6${money(bestSell)} §7each` : "§8No offers",
      icon: ICON.shop,
      onClick: async () => {
        const amounts = [1, 16, 64, 256, 1024].filter((n) => n <= Math.max(1, previewBuy(player, p.id, 1e9).got));
        const pick = await tileMenu(player, {
          title: `BUY ${p.name.toUpperCase()}`,
          theme: "orange",
          body: "§7How many? You pay the cheapest offers first.",
          tiles: [
            ...amounts.map((n) => {
              const pv = previewBuy(player, p.id, n);
              return { text: `§f§l${n}x`, sub: pv.got ? `§6${fmt(Math.ceil(pv.cost / 10))}` : "§8None", icon: p.icon, n };
            }),
            { text: "§b§lCUSTOM", sub: "§7Type amount", icon: ICON.pay, n: "custom" },
            backTile(),
          ],
        });
        if (!pick?.n) return again();
        let n = pick.n;
        if (n === "custom") {
          const res = await showForm(player, new ModalFormData().title(`Buy ${p.name}`).textField("Amount", "e.g. 500"));
          n = parseAmount(res?.formValues?.[0]);
          if (!Number.isFinite(n) || n <= 0) return again();
        }
        instantBuy(player, p, Math.min(n, BAZAAR.maxOrderAmount));
        return again();
      },
    },
    {
      text: "§a§lINSTANT SELL",
      sub: bestBuy !== undefined ? `§a${money(bestBuy)} §7each` : "§8No orders",
      icon: ICON.sell,
      onClick: () => {
        instantSell(player, p, have);
        return again();
      },
    },
    {
      text: "§2§lBUY ORDER",
      sub: "§7Name your price",
      icon: "textures/items/paper",
      onClick: async () => {
        const suggest = bestBuy !== undefined ? bestBuy + 1 : bestSell !== undefined ? Math.max(1, bestSell - 1) : Math.max(1, tenths(p.npc || 1));
        const o = await askOrder(player, p, "b", suggest, BAZAAR.maxOrderAmount);
        if (o) placeBuyOrder(player, p, o.amount, o.pt);
        return again();
      },
    },
    {
      text: "§e§lSELL OFFER",
      sub: have ? `§7Sell your ${commas(have)}` : "§8You have none",
      icon: "textures/items/gold_nugget",
      onClick: async () => {
        if (!have) {
          fail(player, `You don't have any ${p.name}.`);
          return again();
        }
        const suggest = bestSell !== undefined ? Math.max(1, bestSell - 1) : bestBuy !== undefined ? bestBuy + 1 : Math.max(1, tenths((p.npc || 1) * 2));
        const o = await askOrder(player, p, "s", suggest, Math.min(have, BAZAAR.maxOrderAmount));
        if (o) placeSellOffer(player, p, o.amount, o.pt);
        return again();
      },
    },
    backTile(back),
  ];
  await tileMenu(player, { title: clip(p.name.toUpperCase(), 24), theme: "orange", body: lines.join("\n"), tiles });
}

async function manageMenu(player, back) {
  const again = () => manageMenu(player, back);
  const mine = ordersOf(player.id);
  const tiles = [];
  const ready = mine.filter((o) => (o.side === "b" ? o.f > o.c || (open(o) === 0 && o.esc > 0) : (o.e ?? 0) > (o.ce ?? 0)));
  if (ready.length) {
    tiles.push({
      text: "§a§lCLAIM ALL",
      sub: `§7${ready.length} orders`,
      icon: ICON.confirm,
      badge: "HOT",
      onClick: () => {
        const got = ready.map((o) => claimOrder(player, o.item, o.o)).filter(Boolean);
        if (got.length) success(player, `Claimed: ${got.join("; ").replace(/§./g, "")}`);
        return again();
      },
    });
  }
  for (const o of mine) {
    const p = getProducts().byId.get(o.item) ?? productInfo(o.item);
    const pct = Math.floor((o.f / o.a) * 100);
    tiles.push({
      text: `${o.side === "b" ? "§aBUY" : "§6SELL"} §f${clip(p.name, 13)}`,
      sub: `§7${money(o.pt)} §8- §f${pct}%`,
      icon: p.icon,
      onClick: () => orderMenu(player, o, p, again),
    });
  }
  tiles.push(backTile(back));
  await tileMenu(player, {
    title: "MANAGE ORDERS",
    theme: "orange",
    body: mine.length ? `§7Your orders: §f${mine.length}§7/§f${BAZAAR.maxOrdersPerPlayer}§7. Tap one to claim or cancel it.` : "§7You have no Bazaar orders.",
    tiles,
  });
}

async function orderMenu(player, o, p, back) {
  const isBuy = o.side === "b";
  const body = [
    `§7${isBuy ? "§aBuy order" : "§6Sell offer"} §7for §f${p.name}`,
    `§7Price: §f${money(o.pt)} §7each    §7Amount: §f${commas(o.a)}`,
    `§7Filled: §a${commas(o.f)}§7/§f${commas(o.a)}`,
    isBuy ? `§7Items to claim: §f${commas(o.f - o.c)}` : `§7Coins to claim: §a${fmt(Math.floor(afterTax((o.e ?? 0) - (o.ce ?? 0)) / 10))}`,
  ].join("\n");
  await tileMenu(player, {
    title: "ORDER",
    theme: "orange",
    body,
    tiles: [
      {
        text: "§a§lCLAIM",
        sub: "§7Collect what's ready",
        icon: ICON.confirm,
        onClick: () => {
          const got = claimOrder(player, o.item, o.o);
          if (got) success(player, `Claimed ${got.replace(/§./g, "")}.`);
          else fail(player, "Nothing to claim yet.");
          return back();
        },
      },
      {
        text: "§c§lCANCEL ORDER",
        sub: isBuy ? "§7Refund the coins" : "§7Get items back",
        icon: ICON.cancel,
        onClick: () => {
          const got = claimOrder(player, o.item, o.o, true);
          success(player, `Order cancelled${got ? ": " + got.replace(/§./g, "") : ""}.`);
          return back();
        },
      },
      backTile(back),
    ],
  });
}
