import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { CONFIG, SELL_ICONS, SELL_PRICES, SHOP } from "./config.js";
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
import { makeSpawnerItem } from "./spawners.js";
import { ICON, backTile, fail, showForm, success, tileMenu } from "./ui.js";

const pretty = (id) =>
  id
    .replace(/^minecraft:/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

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
    tiles.push({ text: "§c§lADMIN", sub: "§7Manage money", icon: ICON.admin, onClick: () => adminMenu(player) });
  }
  await tileMenu(player, {
    title: "FACTIONS MENU",
    theme: "red",
    body: `§7Welcome back, §f${player.name}§7!    ${balLine(player)}`,
    tiles,
  });
}

// ============================================================================
//  SHOP
// ============================================================================
export async function shopMenu(player, msg) {
  const tiles = SHOP.map((cat) => {
    const count = (cat.items ?? cat.kits ?? cat.spawners ?? []).length;
    return {
      text: `§e§l${cat.name.toUpperCase()}`,
      sub: `§7${count} ${cat.kits ? "kits" : cat.spawners ? "spawners" : "items"}`,
      icon: cat.icon,
      badge: cat.badge,
      onClick: () => categoryMenu(player, cat),
    };
  });
  tiles.push(backTile(() => mainMenu(player)));
  await tileMenu(player, {
    title: "SHOP",
    theme: "gold",
    body: `${msgLine(msg)}§7Pick a category    ${balLine(player)}`,
    tiles,
  });
}

async function categoryMenu(player, cat) {
  let tiles = [];
  if (cat.items) {
    tiles = cat.items.map((item) => ({
      text: `§f${item.name}`,
      sub: `${priceColor(player, item.price)}${fmtShort(item.price)} §7ea`,
      icon: item.icon,
      badge: item.badge,
      onClick: () => buyItemMenu(player, cat, item),
    }));
  } else if (cat.kits) {
    tiles = cat.kits.map((kit) => {
      const wait = kitCooldownLeft(player, kit);
      return {
        text: `§f${kit.name}`,
        sub: wait > 0 ? `§c${formatTime(wait)}` : `${priceColor(player, kit.price)}${fmtShort(kit.price)}`,
        icon: kit.icon,
        badge: kit.badge,
        onClick: () => kitMenu(player, cat, kit),
      };
    });
  } else if (cat.spawners) {
    tiles = cat.spawners.map((sp) => ({
      text: `§f${sp.name}`,
      sub: `${priceColor(player, sp.price)}${fmtShort(sp.price)}`,
      icon: sp.icon,
      badge: sp.badge,
      onClick: () => spawnerMenu(player, cat, sp),
    }));
  }
  tiles.push(backTile(() => shopMenu(player)));
  await tileMenu(player, {
    title: cat.name.toUpperCase(),
    theme: cat.theme,
    body: `§7${cat.desc}    ${balLine(player)}`,
    tiles,
  });
}

// ---- normal items ----------------------------------------------------------
async function buyItemMenu(player, cat, item, msg) {
  const amounts = item.amounts ?? CONFIG.buyAmounts;
  const tiles = amounts.map((n) => {
    const cost = item.price * n;
    return {
      text: `§f§lBUY x${n}`,
      sub: `${priceColor(player, cost)}${fmtShort(cost)}`,
      icon: item.icon,
      onClick: () => buyItemMenu(player, cat, item, buyItem(player, item, n)),
    };
  });
  tiles.push(backTile(() => categoryMenu(player, cat)));
  await tileMenu(player, {
    title: item.name.toUpperCase(),
    theme: cat.theme,
    body: `${msgLine(msg)}§f${item.name} §7- §a${fmt(item.price)} §7each    ${balLine(player)}`,
    tiles,
  });
}

function buyItem(player, item, amount) {
  const cost = item.price * amount;
  if (!makeStack(item.id)) {
    fail(player, `${item.name} isn't a valid item (check config.js).`);
    return "§cThat item is misconfigured.";
  }
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

async function kitMenu(player, cat, kit, msg) {
  const contents = kit.items.map((i) => `${i.amount ? i.amount + "x " : ""}${pretty(i.id)}`).join("§7, §f");
  const wait = kitCooldownLeft(player, kit);
  const tiles = [
    {
      text: "§a§lBUY KIT",
      sub: wait > 0 ? `§c${formatTime(wait)}` : `${priceColor(player, kit.price)}${fmtShort(kit.price)}`,
      icon: kit.icon,
      onClick: () => kitMenu(player, cat, kit, buyKit(player, kit)),
    },
    backTile(() => categoryMenu(player, cat)),
  ];
  await tileMenu(player, {
    title: kit.name.toUpperCase(),
    theme: cat.theme,
    body:
      `${msgLine(msg)}§7Contains: §f${contents}\n` +
      `§7Price: §a${fmt(kit.price)}  §7Cooldown: §f${formatTime(kit.cooldown ?? 0)}    ${balLine(player)}`,
    tiles,
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
    });
  }
  player.setDynamicProperty(`eco:kit:${kit.id}`, Date.now());
  success(player, `Bought the ${kit.name} for ${fmt(kit.price)}.`);
  return `§aBought the §f${kit.name}§a!`;
}

// ---- spawners --------------------------------------------------------------
async function spawnerMenu(player, cat, sp, msg) {
  const tiles = [1, 2, 5].map((n) => {
    const cost = sp.price * n;
    return {
      text: `§f§lBUY x${n}`,
      sub: `${priceColor(player, cost)}${fmtShort(cost)}`,
      icon: sp.icon,
      onClick: () => spawnerMenu(player, cat, sp, buySpawner(player, sp, n)),
    };
  });
  tiles.push(backTile(() => categoryMenu(player, cat)));
  await tileMenu(player, {
    title: `${sp.name.toUpperCase()} SPAWNER`,
    theme: cat.theme,
    body:
      `${msgLine(msg)}§f${sp.name} Spawner §7- §a${fmt(sp.price)} §7each\n` +
      `§7Place it anywhere - it's already set to §f${sp.name}§7.    ${balLine(player)}`,
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
  const counts = countPlain(player);
  const sellable = [...counts].filter(([id]) => SELL_PRICES[id] > 0);
  const total = sellable.reduce((sum, [id, n]) => sum + SELL_PRICES[id] * n, 0);

  const tiles = [];
  if (sellable.length) {
    tiles.push({
      text: "§a§lSELL ALL",
      sub: `§a${fmtShort(total)}`,
      icon: ICON.sell,
      badge: "HOT",
      onClick: () => {
        let earned = 0;
        for (const [id] of sellable) earned += SELL_PRICES[id] * removeAllPlain(player, id);
        addMoney(player, earned);
        success(player, `Sold everything for ${fmt(earned)}.`);
        return sellMenu(player, `§aSold everything for §f${fmt(earned)}§a!`);
      },
    });
  }
  for (const [id, n] of sellable) {
    tiles.push({
      text: `§f${pretty(id)}`,
      sub: `§7x${n} §a${fmtShort(SELL_PRICES[id] * n)}`,
      icon: SELL_ICONS[id] ?? ICON.coin,
      onClick: () => {
        const sold = removeAllPlain(player, id);
        const earned = sold * SELL_PRICES[id];
        addMoney(player, earned);
        success(player, `Sold ${sold}x ${pretty(id)} for ${fmt(earned)}.`);
        return sellMenu(player, `§aSold §f${sold}x ${pretty(id)} §afor §f${fmt(earned)}`);
      },
    });
  }
  tiles.push(backTile(() => mainMenu(player)));

  const info = sellable.length
    ? "§7Click an item to sell all of it."
    : "§7You have nothing sellable. Ores, mob drops & crops sell here!";
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
      backTile(() => mainMenu(player)),
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
  await tileMenu(player, {
    title: "RICHEST PLAYERS",
    theme: "gold",
    body: lines,
    tiles: [backTile(back)],
  });
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
          new ModalFormData()
            .title(`Edit ${target.name}`)
            .dropdown("Action", ["Add", "Remove", "Set"])
            .textField("Amount", "1000")
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
