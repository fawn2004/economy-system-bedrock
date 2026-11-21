import { ItemStack, system, world } from "@minecraft/server";
import { sellPrice } from "./catalog.js";
import { CONFIG, MINION_SETTINGS as MS, MINION_TYPES, MINION_UPGRADES } from "./config.js";
import { addMoney, fmt, getBalance, takeMoney } from "./economy.js";
import { ICON, backTile, fail, success, tileMenu } from "./ui.js";

// ============================================================================
//  MINING MINIONS
//  - eco:minion        the little miner (swings its pickaxe on a loop)
//  - eco:minion_block  the block it "mines" (an entity drawn as a block, so it
//                      can't be broken, blown up, pushed or duplicated)
//  - Production is based on real time: when a minion's area is loaded it
//    catches up on everything it mined since last time (up to its storage).
//  - Data lives on the minion entity (dynamic property eco:mn); a small world
//    registry (eco:mi:<id>) counts minions per player.
// ============================================================================

const MINION = "eco:minion";
const BLOCK = "eco:minion_block";
const ITEM = "eco:mining_minion";
const TAG = "§8eco:minion:";
const REG = "eco:mi:";

const roman = (n) => ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][n] ?? String(n);
const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const pretty = (id) => id.replace(/^minecraft:/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const upDef = (id) => MINION_UPGRADES.find((u) => u.id === id);
const lvl = (d, id) => d.ups?.[id] ?? 0;
const isAdmin = (p) => p.hasTag(CONFIG.adminTag);
const fmtShortish = (n) => (n >= 1e6 ? `$${Math.round(n / 1e5) / 10}M` : n >= 1e4 ? `$${Math.round(n / 100) / 10}k` : fmt(n));
const canManage = (p, d) => !d.owner || d.owner === p.id || isAdmin(p);

// ---- enchanted loot (worth lootMultiplier x the normal item) -------------------
const LOOT = "eco:mloot_";
export const lootIdFor = (base) => LOOT + base.replace(/^minecraft:/, "");
export const baseFromLoot = (id) => (id?.startsWith(LOOT) ? "minecraft:" + id.slice(LOOT.length) : undefined);
export const isMinionLoot = (id) => !!baseFromLoot(id);
export const lootName = (id) => {
  const base = baseFromLoot(id);
  for (const t of MINION_TYPES) for (const tier of t.tiers) if (tier.drop[0] === base) return "Enchanted " + tier.name;
  return "Enchanted " + pretty(base ?? id);
};
export const lootIcon = (id) => {
  const b = baseFromLoot(id)?.replace("minecraft:", "");
  return b ? ({ cobblestone: "textures/blocks/cobblestone", lapis_lazuli: "textures/items/dye_powder_blue", redstone: "textures/items/redstone_dust" }[b] ?? `textures/items/${b}`) : ICON.coin;
};
/** Sell value of one enchanted item made from `base` (tier value, or shop price x lootMultiplier). */
function baseValue(base) {
  for (const t of MINION_TYPES) for (const tier of t.tiers) if (tier.drop[0] === base && tier.value) return tier.value;
  return sellPrice(base) * (MS.lootMultiplier ?? 1);
}
/** Sell price of one enchanted minion item (0 if it isn't one). */
export const lootSellPrice = (id) => {
  const base = baseFromLoot(id);
  return base ? baseValue(base) : 0;
};
const storedValue = (base) => baseValue(base);

function lootStack(base, amount) {
  try {
    const s = new ItemStack(lootIdFor(base), 1);
    s.amount = Math.min(s.maxAmount, amount);
    return s;
  } catch {
    const s = new ItemStack(base, 1); // no enchanted version: give the normal item
    s.amount = Math.min(s.maxAmount, amount);
    return s;
  }
}

// ---- stats -----------------------------------------------------------------
export const intervalOf = (d) => Math.max(1, MS.baseInterval * Math.max(0.1, 1 - (lvl(d, "speed") * (upDef("speed")?.perLevel ?? 0)) / 100));
export const capacityOf = (d) => MS.baseStorage + lvl(d, "storage") * (upDef("storage")?.perLevel ?? 0);
const luckOf = (d) => lvl(d, "luck") * (upDef("luck")?.perLevel ?? 0);
const fortuneOf = (d) => lvl(d, "fortune") * (upDef("fortune")?.perLevel ?? 0);
const stored = (d) => Object.values(d.store ?? {}).reduce((a, b) => a + b, 0);
export const typeOf = (d) => MINION_TYPES.find((t) => t.id === (d?.type ?? "mining")) ?? MINION_TYPES[0];
const tiersOf = (d) => typeOf(d).tiers;
const tierOf = (d) => tiersOf(d)[Math.min(d.tier ?? 0, tiersOf(d).length - 1)];
const nextTierOf = (d) => tiersOf(d)[(d.tier ?? 0) + 1];
const upCost = (d, u, level) => Math.round(u.money[level] * (typeOf(d).upgradeMultiplier ?? 1));

function rollExtra(pct) {
  let n = Math.floor(pct / 100);
  if (Math.random() * 100 < pct % 100) n++;
  return n;
}

function read(e) {
  try {
    const raw = e.getDynamicProperty("eco:mn");
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function write(e, d) {
  e.setDynamicProperty("eco:mn", JSON.stringify(d));
  const total = stored(d), cap = capacityOf(d);
  e.nameTag = `§e${typeOf(d).name} Minion §7[${tierOf(d).name}]\n${total >= cap ? "§c" : "§f"}${commas(total)}/${commas(cap)}${total >= cap ? " FULL" : ""}`;
}

// ---- items -------------------------------------------------------------------
export function makeMinionItem(tier = 0, ups = {}, type = "mining") {
  const s = new ItemStack(ITEM, 1);
  const mt = MINION_TYPES.find((t) => t.id === type) ?? MINION_TYPES[0];
  const t = mt.tiers[tier] ?? mt.tiers[0];
  s.nameTag = `§r§e${mt.name} Minion §7[${t.name}]`;
  const lines = [`§7Tier: §f${t.name} §8(${tier + 1}/${mt.tiers.length})`];
  for (const u of MINION_UPGRADES) if (ups[u.id]) lines.push(`§7${u.name}: §a${roman(ups[u.id])}`);
  lines.push(`§7Place it on a block - it ${mt.kind === "farming" ? "farms" : "mines"}`, "§7the way you are facing.");
  lines.push(`${TAG}${tier}:${MINION_UPGRADES.map((u) => ups[u.id] ?? 0).join(",")}:${mt.id}`);
  s.setLore(lines);
  return s;
}

function readItem(item) {
  if (item?.typeId !== ITEM) return undefined;
  const line = item.getLore().find((l) => l.startsWith(TAG));
  if (!line) return { tier: 0, ups: {}, type: "mining" };
  const [tier, levels, type] = line.slice(TAG.length).split(":");
  const mt = MINION_TYPES.find((t) => t.id === type) ?? MINION_TYPES[0];
  const ups = {};
  (levels ?? "").split(",").forEach((v, i) => {
    const u = MINION_UPGRADES[i];
    if (u && Number(v) > 0) ups[u.id] = Number(v);
  });
  return { tier: Math.min(mt.tiers.length - 1, Math.max(0, Number(tier) || 0)), ups, type: mt.id };
}

const ownedCount = (playerId) =>
  world.getDynamicPropertyIds().filter((k) => {
    if (!k.startsWith(REG)) return false;
    try {
      return JSON.parse(String(world.getDynamicProperty(k))).owner === playerId;
    } catch {
      return false;
    }
  }).length;

// ---- placing -------------------------------------------------------------------
function place(player, block, face, info) {
  const FACE = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] };
  const [ox, oy, oz] = FACE[face] ?? FACE.Up;
  const dim = player.dimension;
  const at = { x: block.x + ox, y: block.y + oy, z: block.z + oz };
  const v = player.getViewDirection();
  const dir = Math.abs(v.x) > Math.abs(v.z) ? { x: Math.sign(v.x), z: 0 } : { x: 0, z: Math.sign(v.z) || 1 };
  const bl = { x: at.x + dir.x, y: at.y, z: at.z + dir.z };
  try {
    if (!dim.getBlock(at)?.isAir || !dim.getBlock(bl)?.isAir) {
      return fail(player, "A minion needs 2 free spaces: one for itself and one in front of it for its block.");
    }
  } catch {
    return;
  }
  if (!isAdmin(player) && ownedCount(player.id) >= MS.maxPerPlayer) {
    return fail(player, `You can only place ${MS.maxPerPlayer} minions.`);
  }
  const m = dim.spawnEntity(MINION, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
  try {
    m.setRotation({ x: 0, y: (Math.atan2(-dir.x, dir.z) * 180) / Math.PI });
  } catch {}
  const mt = MINION_TYPES.find((t) => t.id === info.type) ?? MINION_TYPES[0];
  try {
    m.triggerEvent(`eco:set_skin_${mt.skin ?? 0}`);
  } catch {}
  const b = spawnBlock(dim, bl, mt.tiers[info.tier]?.display ?? 0, m.id);
  const d = {
    type: mt.id, owner: player.id, ownerName: player.name, tier: info.tier, ups: info.ups, store: {},
    last: Date.now(), block: bl, blockId: b?.id,
  };
  write(m, d);
  world.setDynamicProperty(REG + m.id, JSON.stringify({ owner: player.id, dim: dim.id, ...at }));
  if (String(player.getGameMode()).toLowerCase() !== "creative") {
    const inv = player.getComponent("minecraft:inventory").container;
    inv.setItem(player.selectedSlotIndex, undefined);
  }
  player.playSound("random.anvil_land", { volume: 0.5 });
  success(player, "Minion placed! Tap it to open its menu.");
}

function spawnBlock(dim, loc, display, minionId) {
  try {
    const b = dim.spawnEntity(BLOCK, { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 });
    b.triggerEvent(`eco:set_tier_${display}`);
    b.setDynamicProperty("eco:minion", minionId);
    return b;
  } catch {
    return undefined;
  }
}

// ---- working ---------------------------------------------------------------------
function update(e) {
  const d = read(e);
  if (!d) return undefined;
  // make sure its block is there (re-create it if something removed it)
  let blk = d.blockId ? world.getEntity(d.blockId) : undefined;
  if (!blk?.isValid) {
    blk = spawnBlock(e.dimension, d.block, tierOf(d).display ?? 0, e.id);
    d.blockId = blk?.id;
  }
  if (!d.skinSet) {
    try {
      e.triggerEvent(`eco:set_skin_${typeOf(d).skin ?? 0}`);
      d.skinSet = true;
    } catch {}
  }
  const now = Date.now();
  const step = intervalOf(d) * 1000;
  let n = Math.floor((now - d.last) / step);
  let mined = 0;
  if (n > 0) {
    d.last += n * step;
    const cap = capacityOf(d);
    let total = stored(d);
    d.store = d.store ?? {};
    while (n-- > 0 && total < cap) {
      const cur = tierOf(d);
      const next = nextTierOf(d);
      const [item, count] = next && Math.random() * 100 < luckOf(d) ? next.drop : cur.drop;
      const amount = Math.min(cap - total, count * (1 + rollExtra(fortuneOf(d))));
      d.store[item] = (d.store[item] ?? 0) + amount;
      total += amount;
      mined++;
    }
    if (total >= cap) d.last = now; // full: no catching up later
  }
  write(e, d);
  return { d, mined };
}

function tick() {
  const players = world.getAllPlayers();
  const dims = new Set(players.map((p) => p.dimension.id));
  for (const id of dims) {
    let list;
    try {
      list = world.getDimension(id).getEntities({ type: MINION });
    } catch {
      continue;
    }
    for (const e of list) {
      try {
        const r = update(e);
        if (r?.mined && r.d.block) {
          const near = players.some((p) => p.dimension.id === id && (p.location.x - e.location.x) ** 2 + (p.location.z - e.location.z) ** 2 < 256);
          if (near) {
            const at = { x: r.d.block.x + 0.5, y: r.d.block.y + 0.5, z: r.d.block.z + 0.5 };
            e.dimension.playSound(typeOf(r.d).kind === "farming" ? "dig.grass" : "dig.stone", at, { volume: 0.6 });
            try {
              e.dimension.spawnParticle("minecraft:critical_hit_emitter", at);
            } catch {}
          }
        }
      } catch (err) {
        console.warn("[eco] minion: " + err);
      }
    }
  }
}

// ---- menu ------------------------------------------------------------------------------
export async function minionMenu(player, e, msg) {
  if (!e?.isValid) return;
  const r = update(e);
  if (!r) return;
  const d = r.d;
  const manage = canManage(player, d);
  const t = tierOf(d);
  const next = nextTierOf(d);
  const total = stored(d), cap = capacityOf(d);
  const reopen = (m) => minionMenu(player, e, m);
  const worth = Object.entries(d.store ?? {}).reduce((n, [id, c]) => n + storedValue(id) * c, 0);
  const lines = [
    msg,
    `§e${typeOf(d).name} Minion §7- §f${t.name} §8(tier ${(d.tier ?? 0) + 1}/${tiersOf(d).length})   §7Owner: §f${d.ownerName ?? "?"}`,
    `§7${typeOf(d).kind === "farming" ? "Farms" : "Mines"} every §f${intervalOf(d).toFixed(1)}s   §7Storage: ${total >= cap ? "§c" : "§f"}${commas(total)}/${commas(cap)}`,
    `§7Luck: §a${luckOf(d)}%${next ? ` §8(${next.name})` : ""}   §7Fortune: §a+${fortuneOf(d)}%`,
    `§bEach Enchanted ${t.name} sells for ${fmt(storedValue(t.drop[0]))}!`,
  ].filter(Boolean);
  const tiles = [];
  if (manage) {
    tiles.push({ text: "§a§lCOLLECT", sub: `§7${commas(total)} items`, icon: ICON.shop, onClick: () => reopen(collect(player, e)) });
    tiles.push({ text: "§6§lSELL ALL", sub: `§a${fmt(worth)}`, icon: ICON.sell, onClick: () => reopen(sellAll(player, e)) });
    tiles.push({ text: "§b§lUPGRADES", sub: "§7Speed, luck...", icon: ICON.top, onClick: () => upgradesMenu(player, e, () => reopen()) });
    tiles.push({
      text: "§c§lPICK UP",
      sub: "§7Keeps upgrades",
      icon: ICON.cancel,
      onClick: () =>
        tileMenu(player, {
          title: "PICK UP MINION?",
          theme: "red",
          body: "§7The minion goes back to your inventory with its upgrades,\n§7and you get everything it has stored.",
          tiles: [
            { text: "§a§lYES", sub: "§7Pick it up", icon: ICON.confirm, onClick: () => pickUp(player, e) },
            { text: "§c§lNO", sub: "§7Cancel", icon: ICON.cancel, onClick: () => reopen() },
          ],
        }),
    });
  } else {
    lines.push(`§8Only ${d.ownerName ?? "the owner"} can use this minion.`);
  }
  tiles.push({ text: "§7§lCLOSE", sub: "§7Close menu", icon: ICON.back });
  await tileMenu(player, { title: `${typeOf(d).name.toUpperCase()} MINION`, theme: "orange", body: lines.join("\n"), tiles });
}

function collect(player, e) {
  const d = read(e);
  if (!d || !canManage(player, d)) return "§cThis isn't your minion.";
  const inv = player.getComponent("minecraft:inventory")?.container;
  let given = 0, full = false;
  for (const [id, count] of Object.entries(d.store ?? {})) {
    let left = count;
    while (left > 0 && !full) {
      let stack;
      try {
        stack = lootStack(id, left);
      } catch {
        left = 0;
        break;
      }
      const want = stack.amount;
      const overflow = inv.addItem(stack);
      const got = want - (overflow?.amount ?? 0);
      left -= got;
      given += got;
      if (overflow) full = true;
    }
    if (left > 0) d.store[id] = left;
    else delete d.store[id];
    if (full) break;
  }
  write(e, d);
  if (!given) return full ? "§cYour inventory is full!" : "§7Nothing to collect yet.";
  success(player, `Collected ${commas(given)} items.`);
  return full ? `§aCollected §f${commas(given)}§a - §cinventory full, the rest is still stored` : `§aCollected §f${commas(given)} §aitems.`;
}

function sellAll(player, e) {
  const d = read(e);
  if (!d || !canManage(player, d)) return "§cThis isn't your minion.";
  let earned = 0, sold = 0;
  for (const [id, count] of Object.entries(d.store ?? {})) {
    const price = storedValue(id);
    if (price <= 0) continue;
    earned += price * count;
    sold += count;
    delete d.store[id];
  }
  write(e, d);
  if (!sold) return "§7Nothing to sell.";
  addMoney(player, earned);
  success(player, `Sold ${commas(sold)} items for ${fmt(earned)}.`);
  return `§aSold §f${commas(sold)} §aitems for §f${fmt(earned)}§a!`;
}

function pickUp(player, e) {
  const d = read(e);
  if (!d || !canManage(player, d)) return fail(player, "This isn't your minion.");
  const inv = player.getComponent("minecraft:inventory").container;
  const drop = (stack) => {
    const overflow = inv.addItem(stack);
    if (overflow) player.dimension.spawnItem(overflow, player.location);
  };
  drop(makeMinionItem(d.tier ?? 0, d.ups ?? {}, typeOf(d).id));
  for (const [id, count] of Object.entries(d.store ?? {})) {
    let left = count;
    while (left > 0) {
      try {
        const s = lootStack(id, left);
        left -= s.amount;
        drop(s);
      } catch {
        break;
      }
    }
  }
  try {
    if (d.blockId) world.getEntity(d.blockId)?.remove();
  } catch {}
  world.setDynamicProperty(REG + e.id, undefined);
  e.remove();
  success(player, "Minion picked up.");
}

// ---- upgrades ----------------------------------------------------------------------------
function upgradesMenu(player, e, back, msg) {
  const d = read(e);
  if (!d) return back();
  const reopen = (m) => upgradesMenu(player, e, back, m);
  const tiles = MINION_UPGRADES.map((u) => {
    const cur = lvl(d, u.id), max = u.money.length;
    const ok = cur < max && getBalance(player) >= upCost(d, u, cur);
    return {
      text: `§e§l${u.name.toUpperCase()}`,
      sub: cur >= max ? `§a${roman(cur)} §7MAX` : `§7${cur ? roman(cur) : "-"} > ${ok ? "§a" : "§c"}${roman(cur + 1)}`,
      icon: u.icon,
      onClick: () => upgradeDetail(player, e, u, () => reopen()),
    };
  });
  const next = nextTierOf(d);
  tiles.push({
    text: typeOf(d).kind === "farming" ? "§d§lBETTER CROPS" : "§d§lBETTER BLOCKS",
    sub: next ? `§7> ${getBalance(player) >= next.cost ? "§a" : "§c"}${next.name}` : "§aMAX",
    icon: "textures/items/diamond_pickaxe",
    onClick: () => tierDetail(player, e, () => reopen()),
  });
  tiles.push(backTile(back));
  return tileMenu(player, {
    title: "MINION UPGRADES",
    theme: "orange",
    body: (msg ? msg + "\n" : "") + `§7Balance: §a${fmt(getBalance(player))}\n§7Tap an upgrade to see it. §8(green = you can afford it)`,
    tiles,
  });
}

function upgradeDetail(player, e, u, back, msg) {
  const d = read(e);
  if (!d) return back();
  const cur = lvl(d, u.id), max = u.money.length;
  const reopen = (m) => upgradeDetail(player, e, u, back, m);
  const tiles = [];
  const lines = [msg, `§f${u.name} §6${cur ? roman(cur) : "-"}§7/§6${roman(max)}`, `§7${u.desc}`];
  if (cur < max) {
    lines.push(`§7Cost: ${getBalance(player) >= upCost(d, u, cur) ? "§a" : "§c"}${fmt(upCost(d, u, cur))}   §8(you have ${fmt(getBalance(player))})`);
    tiles.push({
      text: `§a§lBUY ${roman(cur + 1)}`,
      sub: `§a${fmtShortish(upCost(d, u, cur))}`,
      icon: u.icon,
      onClick: () => {
        const dd = read(e);
        if (!dd || !canManage(player, dd)) return reopen("§cThis isn't your minion.");
        update(e); // bank progress at the old speed first
        const fresh = read(e);
        const c = lvl(fresh, u.id);
        if (c >= u.money.length) return reopen("§aAlready maxed.");
        if (!takeMoney(player, upCost(fresh, u, c))) {
          fail(player, `You need ${fmt(upCost(fresh, u, c))}.`);
          return reopen(`§cYou need §f${fmt(upCost(fresh, u, c))}§c.`);
        }
        fresh.ups = { ...(fresh.ups ?? {}), [u.id]: c + 1 };
        write(e, fresh);
        player.playSound("random.anvil_use");
        success(player, `Minion ${u.name} ${roman(c + 1)}!`);
        return reopen(`§aUpgraded §f${u.name} §ato §f${roman(c + 1)}§a!`);
      },
    });
  } else lines.push("§aFully upgraded!");
  tiles.push(backTile(back));
  return tileMenu(player, { title: u.name.toUpperCase(), theme: "orange", body: lines.filter(Boolean).join("\n"), tiles });
}

function tierDetail(player, e, back, msg) {
  const d = read(e);
  if (!d) return back();
  const reopen = (m) => tierDetail(player, e, back, m);
  const cur = tierOf(d);
  const next = nextTierOf(d);
  const lines = [
    msg,
    `§fBetter ${typeOf(d).kind === "farming" ? "Crops" : "Blocks"}   §7Now ${typeOf(d).kind === "farming" ? "farming" : "mining"}: §f${cur.name} §8(worth ${fmt(storedValue(cur.drop[0]))} each)`,
    tiersOf(d).map((t, i) => `${i <= (d.tier ?? 0) ? "§a" : "§8"}${t.name}`).join(" §7> "),
  ];
  const tiles = [];
  if (next) {
    lines.push(`§7Next: §e${next.name} §8(worth ${fmt(storedValue(next.drop[0]))} each)   §7Cost: ${getBalance(player) >= next.cost ? "§a" : "§c"}${fmt(next.cost)}`);
    tiles.push({
      text: `§a§lUPGRADE`,
      sub: `§7to ${next.name}`,
      icon: "textures/items/diamond_pickaxe",
      onClick: () => {
        const dd = read(e);
        if (!dd || !canManage(player, dd)) return reopen("§cThis isn't your minion.");
        update(e);
        const fresh = read(e);
        const nt = nextTierOf(fresh);
        if (!nt) return reopen("§aAlready the best tier.");
        if (!takeMoney(player, nt.cost)) {
          fail(player, `You need ${fmt(nt.cost)}.`);
          return reopen(`§cYou need §f${fmt(nt.cost)}§c.`);
        }
        fresh.tier = (fresh.tier ?? 0) + 1;
        write(e, fresh);
        try {
          world.getEntity(fresh.blockId)?.triggerEvent(`eco:set_tier_${tierOf(fresh).display ?? 0}`);
        } catch {}
        player.playSound("random.levelup");
        const verb = typeOf(fresh).kind === "farming" ? "farms" : "mines";
        success(player, `Your minion now ${verb} ${nt.name}!`);
        return reopen(`§aYour minion now ${verb} §f${nt.name}§a!`);
      },
    });
  } else lines.push("§aThis minion mines the best block!");
  tiles.push(backTile(back));
  return tileMenu(player, { title: "BETTER BLOCKS", theme: "orange", body: lines.filter(Boolean).join("\n"), tiles });
}

// ---- events -------------------------------------------------------------------------------
export function registerMinions() {
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(tick, 20));

  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const info = readItem(ev.itemStack);
    if (!info) return;
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const { player, block, blockFace } = ev;
    system.run(() => place(player, block, blockFace, info));
  });

  world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
    try {
      if (target.typeId === MINION) minionMenu(player, target).catch((e) => console.warn("[eco] " + e));
      else if (target.typeId === BLOCK) {
        const m = world.getEntity(String(target.getDynamicProperty("eco:minion")));
        if (m?.isValid) minionMenu(player, m).catch((e) => console.warn("[eco] " + e));
      }
    } catch {}
  });
}
