import { ItemStack, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { addMoney, fmt, fmtShort, getBalance, takeMoney } from "./economy.js";
import { applyEnchants, container } from "./inventory.js";
import { itemIcon as vanillaIcon } from "./itemData.js";
import { ITEMS, makeItem } from "./items.js";
import { PET_TYPES, addPet } from "./pets.js";
import { randomRankOf, rankVoucher } from "./ranks.js";
import { pauseSidebar } from "./sidebar.js";
import { makeSpawnerItem, mobName } from "./spawners.js";
import { ICON, backTile, fail, showForm, success, tileMenu } from "./ui.js";

// ============================================================================
//  CRATES
//  5 crates (Common, Rare, Epic, Legendary, Mythic). Admins place them in
//  Admin > Crates. Tap a crate while holding its key to open it: the lid
//  swings open, the gem floats up and the rewards spin on screen before you
//  get one. Tap without a key to see every reward and its chance.
//  Keys: Key Shop (Common/Rare/Epic), Daily Reward, dungeons, slayer bosses
//  and as rewards from other crates.
// ============================================================================

const CRATE = "eco:crate";
const POUCH_TAG = "§8eco:pouch:";

export const TIERS = [
  { id: "common", name: "Common", color: "§f", price: 50000 },
  { id: "rare", name: "Rare", color: "§9", price: 250000 },
  { id: "epic", name: "Epic", color: "§5", price: 1000000 },
  { id: "legendary", name: "Legendary", color: "§6", price: 0 },
  { id: "mythic", name: "Mythic", color: "§d", price: 0 },
];
export const keyId = (t) => `eco:crate_key_${TIERS[t].id}`;
const tierOfKey = (typeId) => TIERS.findIndex((t) => typeId === `eco:crate_key_${t.id}`);

// ---- reward helpers ------------------------------------------------------------
const stack = (id, n = 1, name) => {
  const s = new ItemStack(id, n);
  if (name) s.nameTag = name;
  return s;
};
const enchanted = (id, name, ench) => () => {
  const s = new ItemStack(id, 1);
  s.nameTag = name;
  applyEnchants(s, ench);
  return s;
};
export function moneyPouch(amount) {
  const s = new ItemStack("eco:money_pouch", 1);
  s.nameTag = `§r§6§lMoney Pouch §r§a${fmtShort(amount)}`;
  s.setLore([`§7Use it to get §a${fmt(amount)}`, POUCH_TAG + amount]);
  return s;
}
const pouchAmount = (s) => {
  const l = s?.getLore().find((x) => x.startsWith(POUCH_TAG));
  return l ? Number(l.slice(POUCH_TAG.length)) || 0 : 0;
};
const custom = (id) => () => (ITEMS[id] ? makeItem(id) : undefined);

// reward kinds: item(() => ItemStack), pouch(amount), key(tier), spawner(mob, n), pet(type, rarity), rank(rarity)
const R = {
  item: (w, label, make, icon) => ({ w, label, icon, give: (p) => giveStack(p, make()) }),
  items: (w, id, n, label, icon) => ({ w, label: label ?? `${n}x ${pretty(id)}`, icon: icon ?? itemIcon(id), give: (p) => giveStack(p, stack(id, n)) }),
  pouch: (w, amount) => ({ w, label: `§6Money Pouch §a${fmtShort(amount)}`, icon: "textures/items/eco_crates/money_pouch", money: amount, give: (p) => giveStack(p, moneyPouch(amount)) }),
  key: (w, t, n = 1) => ({ w, label: `${TIERS[t].color}${n > 1 ? n + "x " : ""}${TIERS[t].name} Key`, icon: `textures/items/eco_crates/key_${TIERS[t].id}`, give: (p) => giveStack(p, stack(keyId(t), n)) }),
  spawner: (w, mob, n = 1) => ({ w, label: `§d${n > 1 ? n + "x " : ""}${mobName(mob)} Spawner`, icon: "minecraft:mob_spawner", give: (p) => giveStack(p, makeSpawnerItem(mob, n)) }),
  pet: (w, t, r) => ({
    w,
    label: `${["§f", "§a", "§9", "§5", "§6"][r]}${["Common", "Uncommon", "Rare", "Epic", "Legendary"][r]} ${PET_TYPES[t]?.name} Pet`,
    icon: PET_TYPES[t]?.icon ?? "textures/items/bone",
    give: (p) => {
      addPet(p, t, r);
      p.sendMessage(`§7The pet was added to §fProfile > Pets§7.`);
    },
  }),
  rank: (w, rarity) => ({
    w,
    label: `${["§f", "§9", "§5", "§6", "§d"][rarity]}${["Common", "Rare", "Epic", "Legendary", "Mythic"][rarity]} Rank Voucher`,
    icon: "textures/items/name_tag",
    give: (p) => giveStack(p, rankVoucher(randomRankOf(rarity))),
  }),
};
const pretty = (id) => id.replace(/^.*:/, "").split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const itemIcon = (id) => id; // resolved when the menu is shown
const iconOf = (r) => (r.icon?.startsWith("minecraft:") ? vanillaIcon(r.icon) : r.icon);

const E = (pairs) => Object.fromEntries(pairs); // [vanilla enchant id, level]

// built on first use (other modules may still be loading when this file runs)
const buildRewards = () => [
  // ---- COMMON ----
  [
    R.pouch(22, 5000),
    R.pouch(12, 15000),
    R.pouch(4, 40000),
    R.items(10, "minecraft:iron_ingot", 32),
    R.items(6, "minecraft:gold_ingot", 24),
    R.items(5, "minecraft:diamond", 4),
    R.items(6, "minecraft:experience_bottle", 16),
    R.items(5, "minecraft:golden_apple", 3),
    R.item(5, "§bEfficiency III Iron Pickaxe", enchanted("minecraft:iron_pickaxe", "§r§bCrate Pickaxe", E([["efficiency", 3], ["unbreaking", 2]])), "minecraft:iron_pickaxe"),
    R.item(5, "§bSharpness III Iron Sword", enchanted("minecraft:iron_sword", "§r§bCrate Sword", E([["sharpness", 3], ["unbreaking", 2]])), "minecraft:iron_sword"),
    R.spawner(6, "pig"),
    R.spawner(4, "chicken"),
    R.spawner(3, "cow"),
    R.rank(3, 0),
    R.key(4, 1),
  ],
  // ---- RARE ----
  [
    R.pouch(18, 25000),
    R.pouch(10, 75000),
    R.pouch(4, 150000),
    R.items(8, "minecraft:diamond", 16),
    R.items(5, "minecraft:emerald", 32),
    R.items(5, "minecraft:diamond_block", 2, "2x Diamond Block", "minecraft:diamond_block"),
    R.item(6, "§bEfficiency V Diamond Pickaxe", enchanted("minecraft:diamond_pickaxe", "§r§9Rare Crate Pickaxe", E([["efficiency", 5], ["unbreaking", 3], ["fortune", 2]])), "minecraft:diamond_pickaxe"),
    R.item(6, "§bSharpness IV Diamond Sword", enchanted("minecraft:diamond_sword", "§r§9Rare Crate Sword", E([["sharpness", 4], ["unbreaking", 3], ["looting", 2]])), "minecraft:diamond_sword"),
    R.item(5, "§9Prospector Pickaxe", custom("miner_pick"), "minecraft:diamond_pickaxe"),
    R.item(4, "§9Lumberjack Axe", custom("lumber_axe"), "minecraft:diamond_axe"),
    R.spawner(6, "zombie"),
    R.spawner(5, "skeleton"),
    R.spawner(4, "spider"),
    R.spawner(3, "creeper"),
    R.pet(3, "rabbit", 1),
    R.rank(4, 1),
    R.key(4, 2),
  ],
  // ---- EPIC ----
  [
    R.pouch(16, 100000),
    R.pouch(9, 300000),
    R.pouch(4, 600000),
    R.items(6, "minecraft:diamond_block", 8, "8x Diamond Block", "minecraft:diamond_block"),
    R.items(4, "minecraft:netherite_ingot", 2),
    R.items(4, "minecraft:enchanted_golden_apple", 1, "Enchanted Golden Apple", "minecraft:enchanted_golden_apple"),
    R.item(5, "§5Phantom Drill", custom("phantom_drill"), "minecraft:diamond_pickaxe"),
    R.item(5, "§5Phantom Scythe", custom("phantom_scythe"), "minecraft:diamond_hoe"),
    R.item(4, "§5Spectral Hatchet", custom("spectral_hatchet"), "minecraft:diamond_axe"),
    R.item(4, "§5Venom Fang", custom("venom_fang"), "minecraft:diamond_sword"),
    R.spawner(5, "blaze"),
    R.spawner(5, "enderman"),
    R.spawner(4, "witch"),
    R.spawner(4, "magma_cube"),
    R.pet(4, "wolf", 2),
    R.pet(3, "silverfish", 2),
    R.rank(4, 2),
    R.key(4, 3),
  ],
  // ---- LEGENDARY ----
  [
    R.pouch(16, 500000),
    R.pouch(9, 1500000),
    R.pouch(4, 3000000),
    R.items(5, "minecraft:netherite_block", 2, "2x Netherite Block", "minecraft:netherite_block"),
    R.items(4, "minecraft:enchanted_golden_apple", 4, "4x Enchanted Golden Apple", "minecraft:enchanted_golden_apple"),
    R.item(5, "§6Sovereign Excavator", custom("sovereign_excavator"), "minecraft:netherite_pickaxe"),
    R.item(5, "§6Sovereign Sickle", custom("sovereign_sickle"), "minecraft:netherite_hoe"),
    R.item(4, "§6Sovereign Timberaxe", custom("sovereign_timberaxe"), "minecraft:netherite_axe"),
    R.item(4, "§6Tyrant's Cleaver", custom("tyrant_blade"), "minecraft:diamond_sword"),
    R.spawner(5, "ghast"),
    R.spawner(5, "wither_skeleton"),
    R.spawner(4, "guardian"),
    R.spawner(3, "blaze", 2),
    R.pet(4, "allay", 3),
    R.pet(3, "dolphin", 3),
    R.rank(5, 3),
    R.key(3, 4),
  ],
  // ---- MYTHIC ----
  [
    R.pouch(14, 2500000),
    R.pouch(8, 7500000),
    R.pouch(3, 15000000),
    R.items(4, "minecraft:netherite_block", 8, "8x Netherite Block", "minecraft:netherite_block"),
    R.item(5, "§6Sovereign Crown", custom("sovereign_helmet"), "minecraft:netherite_helmet"),
    R.item(4, "§6Sovereign Plate", custom("sovereign_chestplate"), "minecraft:netherite_chestplate"),
    R.item(4, "§6Kingsbane", custom("kingsbane"), "minecraft:netherite_sword"),
    R.item(4, "§dVoid Edge", custom("void_edge"), "minecraft:netherite_sword"),
    R.spawner(5, "iron_golem"),
    R.spawner(4, "wither_skeleton", 3),
    R.spawner(4, "ghast", 3),
    R.pet(4, "drake", 4),
    R.pet(3, "wolf", 4),
    R.rank(6, 4),
    R.rank(3, 3),
    R.key(4, 4, 2),
  ],
];
let built;
export const rewardsOf = (t) => (built ??= buildRewards())[t];

const totalW = (t) => rewardsOf(t).reduce((n, r) => n + r.w, 0);
const chance = (t, r) => Math.round((r.w / totalW(t)) * 1000) / 10;
function roll(t) {
  let x = Math.random() * totalW(t);
  for (const r of rewardsOf(t)) if ((x -= r.w) < 0) return r;
  return rewardsOf(t)[0];
}

function giveStack(player, s) {
  if (!s) return;
  const over = container(player)?.addItem(s);
  if (over) player.dimension.spawnItem(over, player.location);
}

// ---- keys ----------------------------------------------------------------------
export function giveKey(player, t, n = 1) {
  giveStack(player, new ItemStack(keyId(t), n));
  player.sendMessage(`§a+${n} ${TIERS[t].color}${TIERS[t].name} Crate Key${n > 1 ? "s" : ""}§a!`);
}
function countKeys(player, t) {
  const inv = container(player);
  let n = 0;
  for (let i = 0; i < (inv?.size ?? 0); i++) {
    const s = inv.getItem(i);
    if (s?.typeId === keyId(t)) n += s.amount;
  }
  return n;
}
function takeKey(player, t) {
  const inv = container(player);
  for (let i = 0; i < (inv?.size ?? 0); i++) {
    const s = inv.getItem(i);
    if (s?.typeId !== keyId(t)) continue;
    if (s.amount > 1) {
      s.amount--;
      inv.setItem(i, s);
    } else inv.setItem(i, undefined);
    return true;
  }
  return false;
}

// ---- opening (animation) -----------------------------------------------------------
const opening = new Set(); // crate entity ids in use
const playerBusy = new Set();

function openCrate(player, crate, t) {
  if (opening.has(crate.id) || playerBusy.has(player.id)) return fail(player, "Wait for the crate to finish opening.");
  if (!takeKey(player, t)) return fail(player, `You need a ${TIERS[t].name} Crate Key.`);
  opening.add(crate.id);
  playerBusy.add(player.id);
  const prize = roll(t);
  const T = TIERS[t];
  try {
    crate.triggerEvent("eco:crate_open");
  } catch {}
  player.playSound("random.chestopen");
  pauseSidebar(player, 140);
  // spin: show random rewards, slowing down, then land on the prize
  const delays = [2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6, 7, 9, 12];
  const pool = rewardsOf(t);
  let i = 0;
  const tick = () => {
    if (!player.isValid) return finish();
    const last = i === delays.length;
    const show = last ? prize : pool[Math.floor(Math.random() * pool.length)];
    try {
      player.onScreenDisplay.setTitle(last ? `${T.color}§l✦ ${T.name.toUpperCase()} ✦` : `${T.color}§l${T.name.toUpperCase()} CRATE`, {
        subtitle: last ? `§f§l${show.label}` : `§7» §f${show.label} §7«`,
        fadeInDuration: 0,
        stayDuration: last ? 60 : 20,
        fadeOutDuration: last ? 10 : 0,
      });
      player.playSound(last ? "random.levelup" : "note.pling", { pitch: last ? 1 : 0.6 + i * 0.08, volume: 0.7 });
    } catch {}
    particles(crate, t, last);
    if (!last) {
      system.runTimeout(tick, delays[i++]);
      return;
    }
    // prize!
    try {
      prize.give(player);
    } catch (e) {
      console.warn("[eco] crate reward: " + e);
    }
    success(player, `You won ${prize.label}§r§a from the ${T.name} Crate!`);
    if (t >= 3 || (prize.money ?? 0) >= 1000000) {
      world.sendMessage(`${T.color}§l${T.name.toUpperCase()} CRATE! §r§f${player.name} §7won §f${prize.label}§7!`);
      try {
        player.playSound("random.totem", { volume: 0.6 });
      } catch {}
    }
    system.runTimeout(finish, 50);
  };
  const finish = () => {
    opening.delete(crate.id);
    playerBusy.delete(player.id);
    try {
      if (crate.isValid) crate.triggerEvent("eco:crate_close");
    } catch {}
  };
  system.runTimeout(tick, 12); // let the lid open first
}

const PARTICLE = ["minecraft:villager_happy", "minecraft:blue_flame_particle", "minecraft:dragon_breath_trail", "minecraft:totem_particle", "minecraft:endrod"];
function particles(crate, t, big) {
  if (!crate.isValid) return;
  const l = crate.location;
  const n = big ? 12 : 2;
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = big ? 0.6 + Math.random() * 0.6 : 0.6;
    try {
      crate.dimension.spawnParticle(PARTICLE[t], { x: l.x + Math.cos(a) * r, y: l.y + 1.2 + Math.random() * (big ? 1.2 : 0.4), z: l.z + Math.sin(a) * r });
    } catch {}
  }
}

// ---- menus ---------------------------------------------------------------------
export async function cratePreview(player, t, crate) {
  const T = TIERS[t];
  const have = countKeys(player, t);
  const tiles = rewardsOf(t).map((r) => ({ text: r.label, sub: `§7Chance: §e${chance(t, r)}%`, icon: iconOf(r) ?? "textures/items/paper", noClick: true }));
  const nav = [];
  if (have && crate) nav.push({ text: "§a§lOPEN", sub: `§7You have §f${have}§7 key${have > 1 ? "s" : ""}`, icon: `textures/items/eco_crates/key_${T.id}`, newRow: true, onClick: () => openCrate(player, crate, t) });
  if (T.price) nav.push({ text: "§6§lBUY KEY", sub: `§a${fmt(T.price)}`, icon: ICON.shop, newRow: !nav.length, onClick: () => buyKey(player, t, () => cratePreview(player, t, crate)) });
  nav.push(backTile(crate ? undefined : () => cratesMenu(player)));
  await tileMenu(player, {
    title: `${T.name} Crate`,
    theme: ["green", "blue", "purple", "gold", "red"][t] ?? "gold",
    body: [
      `§7Rewards from the ${T.color}${T.name} Crate§7.`,
      `§7Your keys: §f${have}`,
      "",
      crate ? "§7Hold a key and tap the crate to open it." : "§7Find the crates at spawn and tap them with a key.",
      T.price ? `§7Buy keys for §a${fmt(T.price)}§7.` : "§8This key can't be bought - win it from crates, dungeons, slayer or daily rewards.",
    ].join("\n"),
    tiles: [...tiles, ...nav],
  });
}

async function buyKey(player, t, back) {
  const T = TIERS[t];
  const res = await showForm(player, new ModalFormData().title(`Buy ${T.name} Keys`).slider(`How many? (${fmt(T.price)} each)`, 1, 16, { valueStep: 1, defaultValue: 1 }));
  if (res && !res.canceled) {
    const n = Math.max(1, Number(res.formValues[0]) || 1);
    if (!takeMoney(player, T.price * n)) fail(player, `You need ${fmt(T.price * n)}.`);
    else {
      giveKey(player, t, n);
      player.playSound("random.orb");
    }
  }
  return back?.();
}

/** Menu > Crates: see every crate's rewards, how many keys you have and buy keys. */
export async function cratesMenu(player, back) {
  await tileMenu(player, {
    title: "Crates",
    theme: "gold",
    body: [
      "§7Open crates with keys for coins, tools, spawners, pets, ranks and more!",
      "§7Better crates = better rewards and bigger money pouches.",
      "",
      "§7Keys come from: §fKey Shop§7, §fDaily Reward§7, §fdungeons§7, §fslayer bosses§7 and other crates.",
      `§7Purse: §a${fmtShort(getBalance(player))}`,
    ].join("\n"),
    tiles: [
      ...TIERS.map((T, t) => ({
        text: `${T.color}§l${T.name.toUpperCase()}`,
        sub: `§7Keys: §f${countKeys(player, t)}${T.price ? `\n§a${fmtShort(T.price)}/key` : ""}`,
        icon: `textures/items/eco_crates/key_${T.id}`,
        onClick: () => cratePreview(player, t),
      })),
      backTile(back),
    ],
  });
}

// ---- admin -----------------------------------------------------------------------
export function placeCrate(player, t) {
  const l = player.location;
  const at = { x: Math.floor(l.x) + 0.5, y: Math.floor(l.y), z: Math.floor(l.z) + 0.5 };
  const e = player.dimension.spawnEntity(CRATE, at);
  try {
    e.triggerEvent(`eco:set_crate_${t}`);
  } catch {}
  e.setDynamicProperty("eco:crate", t);
  e.nameTag = `${TIERS[t].color}§l${TIERS[t].name.toUpperCase()} CRATE\n§7Tap with a key`;
  try {
    e.setRotation({ x: 0, y: (player.getRotation().y + 180) % 360 });
  } catch {}
  return e;
}

export async function adminCrates(player, back) {
  const again = () => adminCrates(player, back);
  await tileMenu(player, {
    title: "Admin: Crates",
    theme: "red",
    body: "§7Place a crate where you're standing (it faces you), remove the nearest one, or give keys.",
    tiles: [
      ...TIERS.map((T, t) => ({
        text: `${T.color}§lPLACE ${T.name.toUpperCase()}`,
        sub: "§7At your feet",
        icon: `textures/items/eco_crates/key_${T.id}`,
        onClick: () => {
          placeCrate(player, t);
          success(player, `Placed a ${T.name} Crate. Step back to see it.`);
          return again();
        },
      })),
      {
        text: "§c§lREMOVE NEAREST",
        sub: "§7Within 6 blocks",
        icon: ICON.cancel,
        newRow: true,
        onClick: () => {
          const list = player.dimension.getEntities({ type: CRATE, location: player.location, maxDistance: 6 });
          if (!list.length) fail(player, "No crate within 6 blocks.");
          else {
            const d2 = (e) => (e.location.x - player.location.x) ** 2 + (e.location.z - player.location.z) ** 2;
            list.sort((a, b) => d2(a) - d2(b))[0].remove();
            success(player, "Crate removed.");
          }
          return again();
        },
      },
      {
        text: "§a§lGIVE KEYS",
        sub: "§7To a player",
        icon: ICON.confirm,
        onClick: async () => {
          const ps = world.getAllPlayers();
          const res = await showForm(
            player,
            new ModalFormData()
              .title("Give crate keys")
              .dropdown("Player", ps.map((p) => p.name), { defaultValueIndex: 0 })
              .dropdown("Crate", TIERS.map((T) => T.name), { defaultValueIndex: 0 })
              .slider("Keys", 1, 64, { valueStep: 1, defaultValue: 1 })
          );
          if (res && !res.canceled) {
            const p = ps[Number(res.formValues[0]) || 0];
            const t = Number(res.formValues[1]) || 0;
            const n = Math.max(1, Number(res.formValues[2]) || 1);
            if (p?.isValid) {
              giveKey(p, t, n);
              success(player, `Gave ${p.name} ${n} ${TIERS[t].name} key${n > 1 ? "s" : ""}.`);
            }
          }
          return again();
        },
      },
      {
        text: "§d§lPOUCH",
        sub: "§7Make a money pouch",
        icon: "textures/items/eco_crates/money_pouch",
        onClick: async () => {
          const res = await showForm(player, new ModalFormData().title("Money pouch").textField("Amount", "e.g. 50000"));
          const n = res && !res.canceled ? Math.floor(Number(String(res.formValues[0]).replace(/[^0-9.]/g, ""))) : 0;
          if (n > 0) giveStack(player, moneyPouch(n));
          return again();
        },
      },
      backTile(back),
    ],
  });
}

export function registerCrates() {
  world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
    if (target?.typeId !== CRATE) return;
    let t = 0;
    try {
      t = Math.max(0, Math.min(TIERS.length - 1, Number(target.getDynamicProperty("eco:crate") ?? 0)));
    } catch {}
    const held = container(player)?.getItem(player.selectedSlotIndex);
    if (held && tierOfKey(held.typeId) === t) return openCrate(player, target, t);
    if (held && tierOfKey(held.typeId) >= 0) fail(player, `That's a ${TIERS[tierOfKey(held.typeId)].name} key - this is the ${TIERS[t].name} Crate.`);
    cratePreview(player, t, target).catch((e) => console.warn("[eco] crate: " + e));
  });
  // money pouches
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (source?.typeId !== "minecraft:player" || itemStack?.typeId !== "eco:money_pouch") return;
    const amount = pouchAmount(itemStack);
    const inv = container(source);
    const s = inv.getItem(source.selectedSlotIndex);
    if (s?.typeId !== "eco:money_pouch") return;
    if (s.amount > 1) {
      s.amount--;
      inv.setItem(source.selectedSlotIndex, s);
    } else inv.setItem(source.selectedSlotIndex, undefined);
    if (amount > 0) {
      addMoney(source, amount);
      source.playSound("random.orb");
      success(source, `Opened a Money Pouch: +${fmt(amount)}!`);
    }
  });
  // crates don't get hurt / pushed - and keep the right name
  world.afterEvents.worldLoad.subscribe(() =>
    system.runInterval(() => {
      for (const p of world.getAllPlayers()) {
        if (playerBusy.has(p.id)) continue;
        // ambient sparkle near crates
        try {
          for (const c of p.dimension.getEntities({ type: CRATE, location: p.location, maxDistance: 16 })) {
            const t = Number(c.getDynamicProperty("eco:crate") ?? 0);
            if (Math.random() < 0.5) particles(c, t, false);
          }
        } catch {}
      }
    }, 20)
  );
}

