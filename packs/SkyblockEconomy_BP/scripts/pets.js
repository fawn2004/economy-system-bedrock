import { ItemStack, system, world } from "@minecraft/server";
import { fmt, fmtShort, getBalance, takeMoney } from "./economy.js";
import { container, freeSlots } from "./inventory.js";
import { RARITIES, STATS, exists } from "./items.js";
import { skillHooks } from "./skills.js";
import { combatHooks, invalidate, isTough, statSources } from "./stats.js";
import { ICON, backTile, fail, pagedMenu, success, tileMenu } from "./ui.js";

// ============================================================================
//  PETS
//  Pets are kept in your Pet Menu (not the inventory). One can be active: it
//  gives stats and a perk that grow with its level (1-100) and rarity.
//  Active pets level up from the skill XP you earn (their own skill gives
//  full XP, other skills a third).
//  Pets can be turned into an item (a named spawn egg) to trade or auction;
//  using that item adds it back to a Pet Menu.
//  Player data: eco:pets = [{ u: uid, t: type, r: rarity, xp }], eco:petOn = uid
// ============================================================================

const TAG = "§8eco:pet:";
const MAX_PETS = 30;
const PET_RARITY_MULT = [0.5, 0.6, 0.72, 0.86, 1];
const RARITY_UPGRADE_COST = [100000, 1000000, 10000000, 50000000]; // Common>Uncommon ... Epic>Legendary
const RARITY_UPGRADE_LEVEL = [10, 25, 50, 75]; // pet level needed to upgrade

// stats = at level 100 Legendary. perk.value = at level 100 Legendary.
export const PET_TYPES = {
  wolf: { name: "Wolf", egg: "minecraft:wolf_spawn_egg", icon: "textures/items/bone", skill: "combat", stats: { str: 30, cd: 40 }, perk: { name: "Pack Hunter", value: 20, desc: "+{v}% damage to bosses and dungeon mobs" } },
  rabbit: { name: "Rabbit", egg: "minecraft:rabbit_spawn_egg", icon: "textures/items/rabbit_foot", skill: "farming", stats: { spd: 20, ffo: 40 }, perk: { name: "Green Paws", value: 25, desc: "+{v}% Farming XP" } },
  bee: { name: "Bee", egg: "minecraft:bee_spawn_egg", icon: "textures/items/honeycomb", skill: "foraging", stats: { str: 20, wfo: 40 }, perk: { name: "Busy Bee", value: 25, desc: "+{v}% Foraging XP" } },
  silverfish: { name: "Silverfish", egg: "minecraft:silverfish_spawn_egg", icon: "textures/blocks/stone", skill: "mining", stats: { def: 50, mfo: 40 }, perk: { name: "Rock Muncher", value: 25, desc: "+{v}% Mining XP" } },
  fox: { name: "Fox", egg: "minecraft:fox_spawn_egg", icon: "textures/items/sweet_berries", skill: "excavating", stats: { spd: 15, mf: 6 }, perk: { name: "Digger", value: 25, desc: "+{v}% Excavating XP" } },
  dolphin: { name: "Dolphin", egg: "minecraft:dolphin_spawn_egg", icon: "textures/items/fish_raw", skill: "fishing", stats: { scc: 8, int: 50 }, perk: { name: "Tide Rider", value: 25, desc: "+{v}% Fishing XP" } },
  allay: { name: "Allay", egg: "minecraft:allay_spawn_egg", icon: "textures/items/amethyst_shard", skill: "any", stats: { int: 100, mf: 10 }, perk: { name: "Bargain", value: 5, desc: "+{v}% coins from Sell" } },
  bat: { name: "Bat", egg: "minecraft:bat_spawn_egg", icon: "textures/items/spider_eye", skill: "combat", stats: { mf: 15, spd: 10 }, perk: { name: "Night Eyes", value: 10, desc: "+{v} Magic Find at night" } },
  drake: { name: "Drakeling", egg: "minecraft:ender_dragon_spawn_egg", icon: "textures/items/dragons_breath", skill: "combat", stats: { str: 50, cd: 50, int: 50, hp: 20 }, perk: { name: "Draconic", value: 10, desc: "+{v}% damage to everything" }, minRarity: 4 },
};

// Pet shop: buy Common pets (rarity can be upgraded in the Pet Menu)
export const PET_SHOP = [
  ["rabbit", 50000], ["silverfish", 50000], ["bee", 50000], ["fox", 50000], ["dolphin", 75000], ["wolf", 100000], ["bat", 150000], ["allay", 500000],
];

// ---- levels ------------------------------------------------------------------
const xpFor = (level, r) => Math.round(20 * Math.pow(level, 1.3) * [1, 1.2, 1.5, 1.8, 2.2][r]);
export function petLevel(xp, r) {
  let lvl = 1, left = xp;
  while (lvl < 100 && left >= xpFor(lvl, r)) {
    left -= xpFor(lvl, r);
    lvl++;
  }
  return { level: lvl, into: left, need: lvl < 100 ? xpFor(lvl, r) : 0 };
}
const scale = (pet) => (petLevel(pet.xp, pet.r).level / 100) * PET_RARITY_MULT[pet.r];
export function petStats(pet) {
  const t = PET_TYPES[pet.t];
  const out = {};
  for (const [k, v] of Object.entries(t?.stats ?? {})) out[k] = Math.max(1, Math.round(v * scale(pet) * 10) / 10);
  return out;
}
export const perkValue = (pet) => Math.round((PET_TYPES[pet.t]?.perk.value ?? 0) * scale(pet) * 10) / 10;
const perkText = (pet) => PET_TYPES[pet.t].perk.desc.replace("{v}", perkValue(pet));

// ---- storage -----------------------------------------------------------------
export function getPets(player) {
  try {
    return JSON.parse(String(player.getDynamicProperty("eco:pets") ?? "[]"));
  } catch {
    return [];
  }
}
const savePets = (player, list) => {
  player.setDynamicProperty("eco:pets", JSON.stringify(list));
  invalidate(player);
};
export function activePet(player) {
  const on = player.getDynamicProperty("eco:petOn");
  return on ? getPets(player).find((p) => p.u === on) : undefined;
}
const uid = () => Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);

export function addPet(player, t, r = 0, xp = 0) {
  const list = getPets(player);
  if (list.length >= MAX_PETS) return false;
  list.push({ u: uid(), t, r: Math.max(PET_TYPES[t]?.minRarity ?? 0, r), xp });
  savePets(player, list);
  return true;
}

// ---- items -------------------------------------------------------------------
export function petItem(pet) {
  const t = PET_TYPES[pet.t];
  const egg = exists(t.egg) ? t.egg : "minecraft:egg";
  const s = new ItemStack(egg, 1);
  const lv = petLevel(pet.xp, pet.r).level;
  s.nameTag = `§r§7[Lv${lv}] ${RARITIES[pet.r].color}${t.name}`;
  const lines = Object.entries(petStats(pet)).map(([k, v]) => `§7${STATS[k].name}: ${STATS[k].color}+${v}`);
  lines.push("", `§6${t.perk.name}`, `§7${perkText(pet)}`, "", "§eUse to add it to your Pet Menu", `${RARITIES[pet.r].color}§l${RARITIES[pet.r].name} PET`);
  lines.push(`${TAG}${pet.t}:${pet.r}:${Math.floor(pet.xp)}`);
  s.setLore(lines);
  return s;
}

export function readPetItem(stack) {
  const line = stack?.getLore().find((l) => l.startsWith(TAG));
  if (!line) return undefined;
  const [t, r, xp] = line.slice(TAG.length).split(":");
  if (!PET_TYPES[t]) return undefined;
  return { t, r: Math.max(0, Math.min(4, Number(r) || 0)), xp: Number(xp) || 0 };
}

function claimPetItem(player) {
  const inv = container(player);
  const slot = player.selectedSlotIndex;
  const it = inv?.getItem(slot);
  const pet = readPetItem(it);
  if (!pet) return;
  if (!addPet(player, pet.t, pet.r, pet.xp)) return fail(player, `Your Pet Menu is full (${MAX_PETS}).`);
  if (it.amount > 1) {
    it.amount--;
    inv.setItem(slot, it);
  } else inv.setItem(slot, undefined);
  success(player, `Added ${PET_TYPES[pet.t].name} to your Pet Menu!`);
  player.playSound("random.pop");
}

// ---- menus -------------------------------------------------------------------
export async function petsMenu(player, back) {
  const again = () => petsMenu(player, back);
  const list = getPets(player);
  const on = activePet(player);
  const tiles = list
    .sort((a, b) => b.r - a.r || b.xp - a.xp)
    .map((p) => {
      const lv = petLevel(p.xp, p.r).level;
      return {
        text: `${RARITIES[p.r].color}${on?.u === p.u ? "§l" : ""}${PET_TYPES[p.t].name}`,
        sub: `§7Lv ${lv}${on?.u === p.u ? " §aACTIVE" : ""}`,
        icon: PET_TYPES[p.t].icon,
        badge: on?.u === p.u ? "HOT" : undefined,
        onClick: () => petMenu(player, p.u, again),
      };
    });
  tiles.unshift({ text: "§e§lPET SHOP", sub: "§7Buy a pet", icon: ICON.shop, onClick: () => petShopMenu(player, again) });
  await pagedMenu(player, {
    title: "PETS",
    theme: "green",
    body: on
      ? `§7Active: ${RARITIES[on.r].color}${PET_TYPES[on.t].name} §7Lv ${petLevel(on.xp, on.r).level}\n§7${perkText(on)}`
      : `§7No active pet. Tap a pet to summon it. §8(${list.length}/${MAX_PETS} pets)`,
    tiles,
    back,
  });
}

async function petMenu(player, u, back) {
  const again = () => petMenu(player, u, back);
  const list = getPets(player);
  const pet = list.find((p) => p.u === u);
  if (!pet) return back();
  const t = PET_TYPES[pet.t];
  const info = petLevel(pet.xp, pet.r);
  const active = player.getDynamicProperty("eco:petOn") === u;
  const lines = [
    `${RARITIES[pet.r].color}§l${RARITIES[pet.r].name} ${t.name.toUpperCase()}§r §7Lv ${info.level}/100`,
    info.need ? `§7XP: §b${Math.floor(info.into)}§7/§b${info.need}` : "§6MAX LEVEL",
    `§7Levels from: §f${t.skill === "any" ? "all skills" : t.skill + " XP (others give a third)"}`,
    "§7Stats: " + Object.entries(petStats(pet)).map(([k, v]) => `${STATS[k].color}+${v} ${STATS[k].name}`).join("§7, "),
    `§6${t.perk.name}: §7${perkText(pet)}`,
  ];
  const tiles = [
    {
      text: active ? "§c§lDESPAWN" : "§a§lSUMMON",
      sub: active ? "§7Put it away" : "§7Make it active",
      icon: active ? ICON.cancel : ICON.confirm,
      onClick: () => {
        player.setDynamicProperty("eco:petOn", active ? undefined : u);
        invalidate(player);
        success(player, active ? `Despawned your ${t.name}.` : `Summoned your ${t.name}!`);
        return back();
      },
    },
  ];
  const r = pet.r;
  if (r < 4) {
    const cost = RARITY_UPGRADE_COST[r];
    const need = RARITY_UPGRADE_LEVEL[r];
    tiles.push({
      text: "§d§lUPGRADE RARITY",
      sub: `${RARITIES[r + 1].color}${RARITIES[r + 1].name} §7${fmtShort(cost)}`,
      icon: "textures/items/nether_star",
      onClick: () => {
        if (info.level < need) fail(player, `It needs to be level ${need} first.`);
        else if (!takeMoney(player, cost)) fail(player, `You need ${fmt(cost)}.`);
        else {
          const cur = getPets(player);
          const p = cur.find((x) => x.u === u);
          p.r++;
          savePets(player, cur);
          success(player, `Your ${t.name} is now ${RARITIES[p.r].name}!`);
          player.playSound("random.levelup");
        }
        return again();
      },
    });
  }
  tiles.push({
    text: "§e§lTO ITEM",
    sub: "§7To trade or sell",
    icon: "textures/items/egg",
    onClick: () => {
      if (freeSlots(player) < 1) {
        fail(player, "You need a free inventory slot.");
        return again();
      }
      const cur = getPets(player).filter((x) => x.u !== u);
      savePets(player, cur);
      if (active) player.setDynamicProperty("eco:petOn", undefined);
      container(player).addItem(petItem(pet));
      success(player, `Your ${t.name} is now an item. Use it to put it back in a Pet Menu.`);
      return back();
    },
  });
  tiles.push(backTile(back));
  await tileMenu(player, { title: t.name.toUpperCase(), theme: "green", body: lines.join("\n"), tiles });
}

async function petShopMenu(player, back) {
  const again = () => petShopMenu(player, back);
  await tileMenu(player, {
    title: "PET SHOP",
    theme: "green",
    body: `§7Pets start Common at level 1. Level them up by playing and upgrade their rarity in the Pet Menu.\n§7Purse: §a${fmt(getBalance(player))}`,
    tiles: [
      ...PET_SHOP.filter(([t]) => PET_TYPES[t]).map(([t, price]) => ({
        text: `§f${PET_TYPES[t].name}`,
        sub: `${getBalance(player) >= price ? "§a" : "§c"}${fmtShort(price)}`,
        icon: PET_TYPES[t].icon,
        onClick: () => {
          if (getPets(player).length >= MAX_PETS) fail(player, "Your Pet Menu is full.");
          else if (!takeMoney(player, price)) fail(player, `You need ${fmt(price)}.`);
          else {
            addPet(player, t, 0, 0);
            success(player, `You got a ${PET_TYPES[t].name} pet! Summon it in the Pet Menu.`);
          }
          return again();
        },
      })),
      backTile(back),
    ],
  });
}

// ---- perks -------------------------------------------------------------------
export function petPerk(player, type) {
  const p = activePet(player);
  return p && p.t === type ? perkValue(p) : 0;
}

function isNight() {
  try {
    const t = world.getTimeOfDay();
    return t > 13000 && t < 23000;
  } catch {
    return false;
  }
}

export function registerPets() {
  statSources.push((player) => {
    const p = activePet(player);
    if (!p) return undefined;
    const stats = petStats(p);
    if (p.t === "bat" && isNight()) stats.mf = (stats.mf ?? 0) + perkValue(p);
    return { label: `Pet: ${PET_TYPES[p.t].name}`, stats, passive: p.t === "allay" ? { coins: perkValue(p) } : undefined };
  });
  const XP_PERK = { rabbit: "farming", bee: "foraging", silverfish: "mining", fox: "excavating", dolphin: "fishing" };
  skillHooks.xpBonus.push((player, id) => {
    const p = activePet(player);
    return p && XP_PERK[p.t] === id ? perkValue(p) : 0;
  });
  combatHooks.damageBonus.push((player, target) => {
    const p = activePet(player);
    if (!p) return 0;
    if (p.t === "wolf" && isTough(target)) return perkValue(p);
    if (p.t === "drake") return perkValue(p);
    return 0;
  });
  // pets level from skill XP
  skillHooks.onXp.push((player, id, gain) => {
    const on = player.getDynamicProperty("eco:petOn");
    if (!on) return;
    const list = getPets(player);
    const p = list.find((x) => x.u === on);
    if (!p) return;
    const t = PET_TYPES[p.t];
    const before = petLevel(p.xp, p.r).level;
    p.xp += t.skill === "any" || t.skill === id ? gain : gain / 3;
    const after = petLevel(p.xp, p.r).level;
    player.setDynamicProperty("eco:pets", JSON.stringify(list));
    if (after > before) {
      invalidate(player);
      player.sendMessage(`§a§lPET LEVEL UP! §r§7Your ${RARITIES[p.r].color}${t.name} §7is now level §e${after}§7!`);
      player.playSound("random.levelup", { pitch: 1.4 });
    }
  });
  // using a pet item adds it to the Pet Menu (and spawn eggs never spawn the mob)
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (source?.typeId === "minecraft:player" && readPetItem(itemStack)) claimPetItem(source);
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!readPetItem(ev.itemStack)) return;
    ev.cancel = true;
    if (ev.isFirstEvent !== false) system.run(() => claimPetItem(ev.player));
  });
  world.beforeEvents.playerInteractWithEntity?.subscribe((ev) => {
    if (readPetItem(ev.itemStack)) ev.cancel = true;
  });
  // a small sparkle above you shows your active pet
  world.afterEvents.worldLoad.subscribe(() =>
    system.runInterval(() => {
      for (const pl of world.getAllPlayers()) {
        if (!pl.getDynamicProperty("eco:petOn")) continue;
        try {
          const l = pl.location;
          const a = (system.currentTick / 20) % (Math.PI * 2);
          pl.dimension.spawnParticle("minecraft:villager_happy", { x: l.x + Math.cos(a) * 0.8, y: l.y + 2.1, z: l.z + Math.sin(a) * 0.8 });
        } catch {}
      }
    }, 10)
  );
}
