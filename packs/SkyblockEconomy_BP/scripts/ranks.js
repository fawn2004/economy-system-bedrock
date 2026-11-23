import { ItemStack, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { addMoney, fmt, fmtShort, getBalance, takeMoney } from "./economy.js";
import { container } from "./inventory.js";
import { ICON, backTile, fail, showForm, success, tileMenu } from "./ui.js";

// ============================================================================
//  CHAT RANKS (100+)
//  Players own ranks (bought in the Rank Shop, won from crates as Rank
//  Vouchers, or given by admins) and pick one to show:
//    - in chat, in front of their messages  (needs the separate "Skyblock
//      Economy Chat" pack + the Beta APIs experiment - it reads the tag below)
//    - above their head (name tag) and on the sidebar
//  Data: player eco:ranks = [owned ids], eco:rankOn = active id
//  For the chat pack: player tag "eco_chat:<prefix>" holds the active prefix.
// ============================================================================

export const RARITY = [
  { name: "Common", color: "§f", price: 25000 },
  { name: "Rare", color: "§9", price: 150000 },
  { name: "Epic", color: "§5", price: 750000 },
  { name: "Legendary", color: "§6", price: 3000000 },
  { name: "Mythic", color: "§d", price: 0 }, // crates only
];

// Colour styles: each letter of the rank cycles through the colours.
const STYLES = {
  white: ["§f"], gray: ["§7"], red: ["§c"], darkred: ["§4"], gold: ["§6"], yellow: ["§e"], green: ["§a"], darkgreen: ["§2"],
  aqua: ["§b"], darkaqua: ["§3"], blue: ["§9"], darkblue: ["§1"], pink: ["§d"], purple: ["§5"], black: ["§0"],
  rainbow: ["§c", "§6", "§e", "§a", "§b", "§9", "§d"],
  fire: ["§4", "§c", "§6", "§e"], ice: ["§f", "§b", "§3"], toxic: ["§2", "§a", "§e"], royal: ["§5", "§d", "§6"],
  ocean: ["§1", "§9", "§b", "§3"], sunset: ["§6", "§c", "§d", "§5"], candy: ["§d", "§f"], shadow: ["§8", "§7"],
  golden: ["§6", "§e"], emerald: ["§2", "§a"], lava: ["§4", "§6"], galaxy: ["§5", "§9", "§d", "§b"], blood: ["§4", "§c"],
  mint: ["§a", "§b"], peach: ["§6", "§d"], storm: ["§8", "§b", "§f"], nature: ["§2", "§6", "§a"], neon: ["§a", "§d", "§b"],
  void: ["§0", "§5", "§8"], sky: ["§b", "§f", "§9"], cherry: ["§d", "§c", "§f"], amber: ["§6", "§e", "§c"],
};

// [id, name, style, rarity, bold?]
const RANK_LIST = [
  // ---- common (solid colours) ----
  ["member", "MEMBER", "gray", 0], ["vip", "VIP", "green", 0], ["builder", "BUILDER", "gold", 0], ["farmer", "FARMER", "green", 0],
  ["miner", "MINER", "gray", 0], ["fisher", "FISHER", "aqua", 0], ["chef", "CHEF", "white", 0], ["baker", "BAKER", "gold", 0],
  ["crafter", "CRAFTER", "yellow", 0], ["explorer", "EXPLORER", "darkgreen", 0], ["traveler", "TRAVELER", "darkaqua", 0], ["camper", "CAMPER", "darkgreen", 0],
  ["sprout", "SPROUT", "green", 0], ["pebble", "PEBBLE", "gray", 0], ["cookie", "COOKIE", "gold", 0], ["bunny", "BUNNY", "white", 0],
  ["fox", "FOX", "gold", 0], ["bee", "BEE", "yellow", 0], ["cat", "CAT", "gray", 0], ["frog", "FROG", "darkgreen", 0],
  ["duck", "DUCK", "yellow", 0], ["panda", "PANDA", "white", 0], ["penguin", "PENGUIN", "darkaqua", 0], ["turtle", "TURTLE", "green", 0],
  ["owl", "OWL", "gold", 0], ["sheep", "SHEEP", "white", 0], ["pig", "PIG", "pink", 0], ["cow", "COW", "gray", 0],
  ["gamer", "GAMER", "red", 0], ["noob", "NOOB", "yellow", 0],
  // ---- rare (bold solid + two-tone) ----
  ["vipplus", "VIP+", "green", 1, true], ["mvp", "MVP", "aqua", 1, true], ["knight", "KNIGHT", "gray", 1, true], ["archer", "ARCHER", "darkgreen", 1, true],
  ["ranger", "RANGER", "emerald", 1], ["hunter", "HUNTER", "amber", 1], ["slayer", "SLAYER", "blood", 1], ["warrior", "WARRIOR", "red", 1, true],
  ["pirate", "PIRATE", "shadow", 1], ["viking", "VIKING", "ice", 1], ["samurai", "SAMURAI", "cherry", 1], ["ninja", "NINJA", "shadow", 1, true],
  ["rogue", "ROGUE", "void", 1], ["bard", "BARD", "peach", 1], ["druid", "DRUID", "nature", 1], ["cleric", "CLERIC", "golden", 1],
  ["wolf", "WOLF", "storm", 1], ["axolotl", "AXOLOTL", "candy", 1], ["shark", "SHARK", "ocean", 1], ["eagle", "EAGLE", "amber", 1],
  ["creeper", "CREEPER", "toxic", 1], ["zombie", "ZOMBIE", "emerald", 1], ["skeleton", "SKELETON", "storm", 1], ["spider", "SPIDER", "blood", 1],
  ["golem", "GOLEM", "sky", 1], ["miner2", "DEEP MINER", "lava", 1], ["captain", "CAPTAIN", "ocean", 1, true], ["sheriff", "SHERIFF", "golden", 1, true],
  // ---- epic (bold multi-colour) ----
  ["mvpplus", "MVP+", "royal", 2, true], ["elite", "ELITE", "galaxy", 2, true], ["hero", "HERO", "sky", 2, true], ["champion", "CHAMPION", "golden", 2, true],
  ["paladin", "PALADIN", "ice", 2, true], ["wizard", "WIZARD", "galaxy", 2, true], ["mage", "MAGE", "neon", 2, true], ["shaman", "SHAMAN", "nature", 2, true],
  ["necro", "NECRO", "void", 2, true], ["vampire", "VAMPIRE", "blood", 2, true], ["werewolf", "WEREWOLF", "storm", 2, true], ["ghost", "GHOST", "shadow", 2, true],
  ["ender", "ENDER", "void", 2, true], ["blaze", "BLAZE", "fire", 2, true], ["frost", "FROST", "ice", 2, true], ["thunder", "THUNDER", "storm", 2, true],
  ["toxic", "TOXIC", "toxic", 2, true], ["candy", "CANDY", "candy", 2, true], ["sunset", "SUNSET", "sunset", 2, true], ["ocean", "OCEAN", "ocean", 2, true],
  ["lord", "LORD", "royal", 2, true], ["baron", "BARON", "amber", 2, true], ["duke", "DUKE", "golden", 2, true], ["mint", "MINTY", "mint", 2, true],
  ["neon", "NEON", "neon", 2, true], ["sakura", "SAKURA", "cherry", 2, true],
  // ---- legendary (rainbow & fancy) ----
  ["legend", "LEGEND", "golden", 3, true], ["king", "KING", "royal", 3, true], ["queen", "QUEEN", "cherry", 3, true], ["emperor", "EMPEROR", "amber", 3, true],
  ["titan", "TITAN", "lava", 3, true], ["dragon", "DRAGON", "fire", 3, true], ["phoenix", "PHOENIX", "fire", 3, true], ["kraken", "KRAKEN", "ocean", 3, true],
  ["rainbow", "RAINBOW", "rainbow", 3, true], ["unicorn", "UNICORN", "rainbow", 3, true], ["galaxy", "GALAXY", "galaxy", 3, true], ["cosmic", "COSMIC", "galaxy", 3, true],
  ["inferno", "INFERNO", "fire", 3, true], ["glacier", "GLACIER", "ice", 3, true], ["tempest", "TEMPEST", "storm", 3, true], ["overlord", "OVERLORD", "void", 3, true],
  ["warlord", "WARLORD", "blood", 3, true], ["archmage", "ARCHMAGE", "neon", 3, true],
  // ---- mythic (crates only) ----
  ["god", "GOD", "rainbow", 4, true], ["mythic", "MYTHIC", "rainbow", 4, true], ["immortal", "IMMORTAL", "golden", 4, true], ["celestial", "CELESTIAL", "sky", 4, true],
  ["eternal", "ETERNAL", "galaxy", 4, true], ["divine", "DIVINE", "golden", 4, true], ["omega", "OMEGA", "void", 4, true], ["supreme", "SUPREME", "rainbow", 4, true],
  ["skylord", "SKYLORD", "rainbow", 4, true], ["infinity", "INFINITY", "galaxy", 4, true],
];

// staff ranks: admins only (never sold or dropped)
const STAFF = [
  ["owner", "OWNER", "red", true], ["coowner", "CO-OWNER", "blood", true], ["admin", "ADMIN", "darkred", true], ["mod", "MOD", "darkgreen", true],
  ["helper", "HELPER", "aqua", true], ["builderstaff", "BUILD TEAM", "gold", true], ["youtuber", "YOUTUBE", "red", true], ["streamer", "STREAMER", "purple", true],
];

function paint(text, style, bold) {
  const cols = STYLES[style] ?? ["§f"];
  const b = bold ? "§l" : "";
  if (cols.length === 1) return `${cols[0]}${b}${text}`;
  let i = 0;
  return [...text].map((ch) => (ch === " " ? " " : `${cols[i++ % cols.length]}${b}${ch}`)).join("");
}

export const RANKS = {};
for (const [id, name, style, rarity, bold] of RANK_LIST) {
  RANKS[id] = { id, name, rarity, style, staff: false, prefix: `§8[${paint(name, style, bold)}§r§8]` };
}
for (const [id, name, style, bold] of STAFF) {
  RANKS[id] = { id, name, rarity: 4, style, staff: true, prefix: `§8[${paint(name, style, bold)}§r§8]` };
}

// ---- data --------------------------------------------------------------------
export function ownedRanks(p) {
  try {
    return new Set(JSON.parse(String(p.getDynamicProperty("eco:ranks") ?? "[]")));
  } catch {
    return new Set();
  }
}
export function giveRank(p, id) {
  const owned = ownedRanks(p);
  const isNew = !owned.has(id);
  owned.add(id);
  p.setDynamicProperty("eco:ranks", JSON.stringify([...owned]));
  return isNew;
}
export const activeRank = (p) => RANKS[p.getDynamicProperty("eco:rankOn")];

/** Shows the active rank above the head and tells the chat pack (tag eco_chat:<prefix>). */
export function applyRank(p) {
  const r = activeRank(p);
  try {
    p.nameTag = r ? `${r.prefix} §f${p.name}` : p.name;
  } catch {}
  try {
    for (const t of p.getTags()) if (t.startsWith("eco_chat:")) p.removeTag(t);
    if (r) p.addTag("eco_chat:" + r.prefix);
  } catch {}
}

export function setRank(p, id) {
  p.setDynamicProperty("eco:rankOn", id || undefined);
  applyRank(p);
}

// ---- vouchers (crate rewards) --------------------------------------------------
const VOUCHER_TAG = "§8eco:rank:";
export function rankVoucher(id) {
  const r = RANKS[id];
  const s = new ItemStack("minecraft:name_tag", 1);
  s.nameTag = `§r§eRank Voucher: ${r.prefix}`;
  s.setLore([`§7${RARITY[r.rarity].color}${RARITY[r.rarity].name} chat rank`, "§7Redeem it in §fRanks > Redeem Vouchers", "§7(or use it)", VOUCHER_TAG + id]);
  return s;
}
export const voucherRank = (stack) => {
  const l = stack?.getLore().find((x) => x.startsWith(VOUCHER_TAG));
  return l ? l.slice(VOUCHER_TAG.length) : undefined;
};
export const randomRankOf = (rarity) => {
  const list = Object.values(RANKS).filter((r) => !r.staff && r.rarity === rarity);
  return list[Math.floor(Math.random() * list.length)]?.id;
};

function redeem(player, slot) {
  const inv = container(player);
  const it = inv.getItem(slot);
  const id = voucherRank(it);
  if (!id || !RANKS[id]) return;
  const isNew = giveRank(player, id);
  if (it.amount > 1) {
    it.amount--;
    inv.setItem(slot, it);
  } else inv.setItem(slot, undefined);
  if (isNew) success(player, `Unlocked the ${RANKS[id].name} rank! Pick it in Ranks.`);
  else {
    // already owned: refund half the shop price of that rarity
    const refund = Math.floor((RARITY[RANKS[id].rarity].price || 5000000) / 2);
    player.sendMessage(`§7You already had ${RANKS[id].prefix}§7 - got §a${fmt(refund)}§7 instead.`);
    addMoney(player, refund);
  }
  player.playSound("random.levelup");
}

// ---- menus -------------------------------------------------------------------
const rankTile = (r, sub, onClick, extra = {}) => ({ text: r.prefix, sub, icon: "textures/items/name_tag", onClick, ...extra });

export async function ranksMenu(player, back) {
  const again = () => ranksMenu(player, back);
  const owned = ownedRanks(player);
  const on = activeRank(player);
  const inv = container(player);
  const vouchers = [];
  for (let i = 0; i < (inv?.size ?? 0); i++) if (voucherRank(inv.getItem(i))) vouchers.push(i);
  const tiles = [
    { text: "§e§lMY RANKS", sub: `§7${owned.size} owned`, icon: "textures/items/name_tag", onClick: () => myRanks(player, again) },
    { text: "§6§lRANK SHOP", sub: `§7${Object.values(RANKS).filter((r) => !r.staff && RARITY[r.rarity].price).length} ranks for sale`, icon: ICON.shop, onClick: () => rankShop(player, again) },
  ];
  if (vouchers.length) {
    tiles.push({
      text: "§a§lREDEEM VOUCHERS",
      sub: `§7${vouchers.length} in your inventory`,
      icon: "textures/items/paper",
      badge: "NEW",
      onClick: async () => {
        for (const i of vouchers) redeem(player, i);
        return again();
      },
    });
  }
  if (on) tiles.push({ text: "§c§lREMOVE RANK", sub: "§7Show no rank", icon: ICON.cancel, onClick: () => (setRank(player, undefined), success(player, "Rank hidden."), again()) });
  tiles.push(backTile(back));
  await tileMenu(player, {
    title: "Ranks",
    theme: "purple",
    body: [
      `§7Your rank: ${on ? on.prefix : "§8none"}`,
      `§7Preview: ${on ? on.prefix + " " : ""}§f${player.name}§7: hello!`,
      "",
      "§7Ranks show in chat, above your head and on the sidebar.",
      "§7Get them in the Rank Shop or from §dcrates§7 (Mythic ranks are crate-only).",
    ].join("\n"),
    tiles,
  });
}

async function myRanks(player, back) {
  const again = () => myRanks(player, back);
  const owned = [...ownedRanks(player)].filter((id) => RANKS[id]).map((id) => RANKS[id]).sort((a, b) => b.rarity - a.rarity);
  const on = activeRank(player);
  await tileMenu(player, {
    title: "My Ranks",
    theme: "purple",
    body: owned.length ? "§7Tap a rank to use it." : "§7You don't own any ranks yet. Buy one in the Rank Shop or win one from a crate!",
    tiles: [
      ...owned.map((r) =>
        rankTile(r, `${RARITY[r.rarity].color}${RARITY[r.rarity].name}${on?.id === r.id ? "\n§aIN USE" : ""}`, () => {
          setRank(player, r.id);
          success(player, `Your rank is now ${r.name}.`);
          return again();
        })
      ),
      backTile(back),
    ],
  });
}

async function rankShop(player, back, rarity = 0) {
  const again = () => rankShop(player, back, rarity);
  const owned = ownedRanks(player);
  const list = Object.values(RANKS).filter((r) => !r.staff && r.rarity === rarity);
  const tabs = RARITY.map((ra, i) => ({
    text: `${ra.color}§l${ra.name.toUpperCase()}`,
    sub: ra.price ? `§a${fmtShort(ra.price)} each` : "§dCrates only",
    icon: "textures/items/name_tag",
    newRow: i === 0,
    badge: i === rarity ? "HOT" : undefined,
    onClick: () => rankShop(player, back, i),
  }));
  const tiles = list.map((r, i) => {
    const has = owned.has(r.id);
    const price = RARITY[r.rarity].price;
    return rankTile(r, has ? "§aOwned" : price ? `${getBalance(player) >= price ? "§a" : "§c"}${fmt(price)}` : "§dCrates only", async () => {
      if (has || !price) return again();
      const ok = await tileMenu(player, {
        title: `Buy ${r.name}`,
        theme: "purple",
        body: `${r.prefix} §f${player.name}§7: hello!\n\n§7Price: §a${fmt(price)}`,
        tiles: [{ text: "§a§lBUY", sub: `§a${fmt(price)}`, icon: ICON.confirm, id: "yes" }, backTile()],
      });
      if (ok?.id === "yes") {
        if (!takeMoney(player, price)) fail(player, `You need ${fmt(price)}.`);
        else {
          giveRank(player, r.id);
          setRank(player, r.id);
          success(player, `You bought the ${r.name} rank!`);
        }
      }
      return again();
    }, { newRow: i === 0 });
  });
  await tileMenu(player, {
    title: `Rank Shop - ${RARITY[rarity].name}`,
    theme: "purple",
    body: `§7Pick a rarity on the top row. Purse: §a${fmtShort(getBalance(player))}`,
    tiles: [...tabs, ...tiles, backTile(back)],
  });
}

/** Admin: give any rank (staff ranks too) to an online player. */
export async function adminRanks(player, back) {
  const players = world.getAllPlayers();
  const ids = Object.keys(RANKS);
  const res = await showForm(
    player,
    new ModalFormData()
      .title("Give a rank")
      .dropdown("Player", players.map((p) => p.name), { defaultValueIndex: 0 })
      .dropdown("Rank", ids.map((id) => `${RANKS[id].name}${RANKS[id].staff ? " (staff)" : ""}`), { defaultValueIndex: 0 })
      .toggle("Also make it their active rank", { defaultValue: true })
  );
  if (res && !res.canceled) {
    const target = players[Number(res.formValues[0]) || 0];
    const id = ids[Number(res.formValues[1]) || 0];
    if (target?.isValid) {
      giveRank(target, id);
      if (res.formValues[2]) setRank(target, id);
      success(player, `Gave ${target.name} the ${RANKS[id].name} rank.`);
      target.sendMessage(`§a§lRANK! §r§7You got the ${RANKS[id].prefix}§7 rank.`);
    }
  }
  return back();
}

export function registerRanks() {
  world.afterEvents.playerSpawn.subscribe(({ player }) => system.runTimeout(() => player.isValid && applyRank(player), 20));
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (source?.typeId !== "minecraft:player" || !voucherRank(itemStack)) return;
    redeem(source, source.selectedSlotIndex);
  });
  // name tags can't be used on mobs while they're vouchers
  world.beforeEvents.playerInteractWithEntity?.subscribe((ev) => {
    if (voucherRank(ev.itemStack)) ev.cancel = true;
  });
}

