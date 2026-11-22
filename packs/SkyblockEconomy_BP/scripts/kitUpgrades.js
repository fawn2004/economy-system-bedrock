import { ItemStack } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { fmt, fmtShort, getBalance, takeMoney } from "./economy.js";
import { applyEnchants, container, freeSlots, giveItems } from "./inventory.js";
import { ENCHANTS, ITEMS, RARITIES, REFORGES, exists, kindOf, makeItem, readItem, renderItem, roman } from "./items.js";
import { addEssence, dungeonLevel, getEssence, inDungeon } from "./dungeons.js";
import { adminRpgTiles } from "./profile.js";
import { skillLevel } from "./skills.js";
import { countCustom, takeCustom } from "./slayer.js";
import { invalidate, statSources } from "./stats.js";
import { ICON, backTile, fail, showForm, success, tileMenu } from "./ui.js";
import { itemIcon } from "./itemData.js";

// ============================================================================
//  UPGRADABLE KITS
//  Six kit lines: Farming, Mining, Foraging, Fishing, Combat and Dungeon.
//  Each goes from level 1 to 10 (MAXED). Every level:
//    - makes the gear you claim better: stronger material, vanilla and custom
//      enchantments, a reforge, higher rarity (and stars for the Dungeon Kit)
//    - adds more supplies to each claim
//    - raises the kit's permanent perk (e.g. Farming Fortune, Magic Find)
//  Claim the kit once every CLAIM_HOURS. Kit gear is marked "Kit item": it
//  can't be sold or put on the Auction House.
//  Upgrades cost coins, need a skill level (Dungeon: Dungeon level) and, for
//  the top Combat / Dungeon levels, slayer materials or Essence.
//  Player data: eco:kitlvl:<line> = level, eco:kitclaim:<line> = last claim (ms)
// ============================================================================

export const MAX_LEVEL = 10;
export const CLAIM_HOURS = 12;
const HOUR = 3600 * 1000;

const TOOL_MAT = ["stone", "iron", "iron", "diamond", "diamond", "diamond", "netherite", "netherite", "netherite", "netherite"];
const ARMOR_MAT = ["leather", "chainmail", "iron", "iron", "diamond", "diamond", "diamond", "netherite", "netherite", "netherite"];
const RARITY = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5];
const ARMOR = ["helmet", "chestplate", "leggings", "boots"];

/** Level of something that reaches `max` at kit level 10 (at least 1). */
const up = (max, t) => Math.max(1, Math.min(max, Math.ceil((t * max) / 10)));
const when = (cond, obj) => (cond ? obj : {});

// gear spec: { base, custom?, ench (vanilla), cust (custom enchants), reforge, stars, rarity }
const tool = (t, base, ench, cust, reforge) => ({ base, ench: { unbreaking: up(3, t), ...when(t >= 7, { mending: 1 }), ...ench }, cust, reforge: t >= 3 ? reforge : "", rarity: RARITY[t - 1] });

export const LINES = {
  farming: {
    name: "Farming Kit", icon: "textures/items/diamond_hoe", skill: "farming", base: 10000,
    perk: { ffo: 4 }, perkText: "+4 Farming Fortune per level",
    gear: (t) => [
      tool(t, `minecraft:${TOOL_MAT[t - 1]}_hoe`, { efficiency: up(5, t) }, { hv: up(5, t), ef: up(5, t) }, "blessed"),
      ...(t >= 4 ? ARMOR.map((a) => ({ custom: `farmer_${a}`, cust: t >= 6 ? { gr: up(5, t) } : {}, rarity: RARITY[t - 1] })) : []),
    ],
    supplies: (t) => [["minecraft:bone_meal", 16 + 8 * t], ["minecraft:wheat_seeds", 16], ["minecraft:carrot", 4 + 2 * t], ["minecraft:potato", 4 + 2 * t], ...(t >= 3 ? [["minecraft:sugar_cane", 4 + t]] : []), ...(t >= 5 ? [["minecraft:melon_seeds", 8], ["minecraft:pumpkin_seeds", 8]] : [])],
  },
  mining: {
    name: "Mining Kit", icon: "textures/items/diamond_pickaxe", skill: "mining", base: 10000,
    perk: { mfo: 4, ms: 3 }, perkText: "+4 Mining Fortune, +3 Mining Speed per level",
    gear: (t) => [
      tool(t, `minecraft:${TOOL_MAT[t - 1]}_pickaxe`, { efficiency: up(5, t), fortune: up(3, t) }, { ef: up(5, t), hv: up(5, t) }, t >= 6 ? "blessed" : "hasty"),
      ...(t >= 4 ? ARMOR.map((a) => ({ custom: `miner_${a}`, cust: t >= 6 ? { bw: up(5, t) } : {}, rarity: RARITY[t - 1] })) : []),
    ],
    supplies: (t) => [["minecraft:torch", 16 + 8 * t], ["minecraft:cooked_beef", 8 + 2 * t], ...(t >= 5 ? [["minecraft:golden_carrot", 4 + t]] : [])],
  },
  foraging: {
    name: "Foraging Kit", icon: "textures/items/diamond_axe", skill: "foraging", base: 10000,
    perk: { wfo: 4, str: 1 }, perkText: "+4 Foraging Fortune, +1 Strength per level",
    gear: (t) => [tool(t, `minecraft:${TOOL_MAT[t - 1]}_axe`, { efficiency: up(5, t) }, { hv: up(5, t), ef: up(5, t) }, "blessed")],
    supplies: (t) => [["minecraft:oak_sapling", 4 + t], ["minecraft:birch_sapling", 2 + t], ["minecraft:bone_meal", 16 + 4 * t], ["minecraft:apple", 4 + t]],
  },
  fishing: {
    name: "Fishing Kit", icon: "textures/items/fishing_rod_uncast", skill: "fishing", base: 12000,
    perk: { scc: 0.5, int: 3 }, perkText: "+0.5% Sea Creature Chance, +3 Intelligence per level",
    gear: (t) => [
      t >= 6
        ? { custom: "angler_rod", ench: { unbreaking: 3, luck_of_the_sea: up(3, t), lure: up(3, t), ...when(t >= 7, { mending: 1 }) }, cust: { an: up(5, t) }, reforge: "blessed", rarity: RARITY[t - 1] }
        : tool(t, "minecraft:fishing_rod", { luck_of_the_sea: up(3, t), lure: up(3, t) }, { an: up(5, t) }, "blessed"),
    ],
    supplies: (t) => [["minecraft:cooked_cod", 8 + 2 * t], ...(t >= 4 ? [["minecraft:cooked_salmon", 8 + t]] : [])],
  },
  combat: {
    name: "Combat Kit", icon: "textures/items/diamond_sword", skill: "combat", base: 15000,
    perk: { str: 3, cc: 0.5, mf: 0.5 }, perkText: "+3 Strength, +0.5% Crit Chance, +0.5 Magic Find per level",
    gear: (t) => [
      tool(
        t, `minecraft:${TOOL_MAT[t - 1]}_sword`,
        { sharpness: up(5, t), looting: up(3, t), ...when(t >= 5, { fire_aspect: up(2, t) }) },
        { sh: up(5, t), ...when(t >= 3, { ls: up(5, t) }), ...when(t >= 5, { cr: up(5, t) }), ...when(t >= 6, { ex: up(5, t) }), ...when(t >= 8, { st: up(3, t) }) },
        t >= 7 ? "savage" : "brutal"
      ),
      ...(t >= 3 ? [tool(t, "minecraft:bow", { power: up(5, t), ...when(t >= 5, { infinity: 1 }) }, { sh: up(5, t), ...when(t >= 5, { cr: up(5, t) }) }, "keen")] : []),
      ...ARMOR.map((a) => ({
        base: `minecraft:${ARMOR_MAT[t - 1]}_${a}`,
        ench: { protection: up(4, t), unbreaking: up(3, t), ...when(t >= 7, { mending: 1 }) },
        cust: { ...when(t >= 2, { gr: up(5, t) }), ...when(t >= 4, { bw: up(5, t) }) },
        reforge: t >= 6 ? "titanic" : t >= 3 ? "sturdy" : "",
        rarity: RARITY[t - 1],
      })),
    ],
    supplies: (t) => [["minecraft:cooked_beef", 16], ["minecraft:golden_apple", 1 + Math.floor(t / 2)], ...(t >= 3 && t < 5 ? [["minecraft:arrow", 32]] : t >= 5 ? [["minecraft:arrow", 1]] : [])],
    mats: { 6: [["rotten_core", 32]], 7: [["venom_sac", 32]], 8: [["marrow_shard", 48]], 9: [["tyrant_fang", 2], ["silk_crown", 2]], 10: [["void_heart", 1], ["colossus_skull", 2]] },
  },
  dungeon: {
    name: "Dungeon Kit", icon: "textures/items/ender_eye", dungeon: true, base: 20000,
    perk: { def: 3, str: 2, mf: 1 }, perkText: "+3 Defense, +2 Strength, +1 Magic Find per level (in dungeons)",
    gear: (t) => {
      const set = t <= 3 ? "crypt" : t <= 6 ? "phantom" : "sovereign";
      const weapon = t <= 3 ? "crypt_blade" : t <= 6 ? "bonebreaker" : "kingsbane";
      const stars = [0, 1, 2, 0, 1, 3, 0, 2, 4, 5][t - 1];
      const bump = t === 10 ? 1 : 0;
      return [
        { custom: weapon, stars, cust: { sh: up(5, t), ls: up(5, t), cr: up(5, t) }, bump },
        ...ARMOR.map((a) => ({ custom: `${set}_${a}`, stars, cust: { gr: up(5, t), bw: up(5, t) }, bump })),
      ];
    },
    supplies: (t) => [["minecraft:golden_apple", 2 + Math.floor(t / 2)], ["minecraft:cooked_beef", 16]],
    essence: (t) => 10 * t, // Essence added on each claim
    upgradeEssence: (t) => 25 * t * t,
  },
};

// ---- data --------------------------------------------------------------------
export const kitLevel = (p, line) => Math.max(0, Math.min(MAX_LEVEL, Number(p.getDynamicProperty(`eco:kitlvl:${line}`) ?? 0)));
const lastClaim = (p, line) => Number(p.getDynamicProperty(`eco:kitclaim:${line}`) ?? 0);
const upgradeCost = (line, t) => Math.round(LINES[line].base * Math.pow(2, t - 1));
const levelNeeded = (t) => 2 * (t - 1);

function reqLevel(p, line) {
  const L = LINES[line];
  return L.dungeon ? dungeonLevel(p) : skillLevel(p, L.skill);
}
const reqName = (line) => (LINES[line].dungeon ? "Dungeon level" : `${LINES[line].skill[0].toUpperCase()}${LINES[line].skill.slice(1)} level`);
const reqFor = (line, t) => (LINES[line].dungeon ? t - 1 : levelNeeded(t));

// ---- gear --------------------------------------------------------------------
function buildStack(spec) {
  let stack, info;
  if (spec.custom) {
    stack = makeItem(spec.custom);
    if (!stack) return undefined;
    info = readItem(stack);
    info.rarity = Math.min(5, Math.max(info.rarity, spec.rarity ?? 0) + (spec.bump ?? 0));
  } else {
    if (!exists(spec.base)) return undefined;
    stack = new ItemStack(spec.base, 1);
    info = { id: "-", def: undefined, kind: kindOf(spec.base), rarity: spec.rarity ?? 0, reforge: "", stars: 0, ench: {} };
  }
  info.ench = { ...(spec.cust ?? {}) };
  info.reforge = REFORGES[spec.reforge] ? spec.reforge : info.reforge;
  if (spec.stars) info.stars = spec.stars;
  info.kit = true;
  applyEnchants(stack, spec.ench);
  renderItem(stack, info);
  stack.keepOnDeath = true;
  return stack;
}

const pretty = (id) => id.replace(/^minecraft:/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
function describe(spec) {
  const name = spec.custom ? ITEMS[spec.custom]?.name ?? spec.custom : pretty(spec.base);
  const rar = RARITIES[Math.min(5, (spec.custom ? Math.max(ITEMS[spec.custom]?.rarity ?? 0, spec.rarity ?? 0) : spec.rarity ?? 0) + (spec.bump ?? 0))];
  const bits = [];
  if (spec.reforge) bits.push(REFORGES[spec.reforge]?.name);
  for (const [e, l] of Object.entries(spec.ench ?? {})) bits.push(`${pretty(e)} ${roman(l)}`);
  for (const [c, l] of Object.entries(spec.cust ?? {})) bits.push(`§d${ENCHANTS[c]?.name} ${roman(l)}§7`);
  if (spec.stars) bits.push(`§6${"✪".repeat(spec.stars)}§7`);
  return `${rar.color}${name}§7${bits.length ? ": " + bits.join(", ") : ""}`;
}

function contentsText(line, t) {
  const L = LINES[line];
  const out = L.gear(t).map((g) => "§7- " + describe(g));
  out.push("§7- Supplies: " + L.supplies(t).map(([id, n]) => `${n}x ${pretty(id)}`).join(", "));
  if (L.essence) out.push(`§7- §d${L.essence(t)} Essence`);
  return out;
}

const perkStats = (line, t) => {
  const mult = t * (t >= MAX_LEVEL ? 1.25 : 1); // maxed kits get +25%
  return Object.fromEntries(Object.entries(LINES[line].perk).map(([k, v]) => [k, Math.round(v * mult * 10) / 10]));
};

// ---- actions -----------------------------------------------------------------
function claim(player, line) {
  const L = LINES[line];
  const t = kitLevel(player, line);
  if (!t) return fail(player, `Unlock the ${L.name} first.`);
  const wait = lastClaim(player, line) + CLAIM_HOURS * HOUR - Date.now();
  if (wait > 0) return fail(player, `You can claim the ${L.name} again in ${Math.floor(wait / HOUR)}h ${Math.ceil((wait % HOUR) / 60000)}m.`);
  const gear = L.gear(t);
  if (freeSlots(player) < gear.length) return fail(player, `You need ${gear.length} free inventory slots for the gear.`);
  player.setDynamicProperty(`eco:kitclaim:${line}`, Date.now());
  const inv = container(player);
  for (const g of gear) {
    const st = buildStack(g);
    if (st) inv.addItem(st);
  }
  for (const [id, n] of L.supplies(t)) {
    giveItems(player, id, n, (s) => s.setLore(["§8Kit item"]));
  }
  if (L.essence) addEssence(player, L.essence(t));
  success(player, `Claimed your ${L.name} (level ${t})!`);
  player.playSound("random.levelup", { pitch: 1.3 });
}

function upgrade(player, line) {
  const L = LINES[line];
  const t = kitLevel(player, line) + 1;
  if (t > MAX_LEVEL) return fail(player, `Your ${L.name} is already maxed!`);
  const need = reqFor(line, t);
  if (reqLevel(player, line) < need) return fail(player, `You need ${reqName(line)} ${need}.`);
  const mats = L.mats?.[t] ?? [];
  for (const [id, n] of mats) if (countCustom(player, id) < n) return fail(player, `You need ${n}x ${ITEMS[id].name}.`);
  const ess = L.upgradeEssence?.(t) ?? 0;
  if (getEssence(player) < ess) return fail(player, `You need ${ess} Essence.`);
  const coins = upgradeCost(line, t);
  if (!takeMoney(player, coins)) return fail(player, `You need ${fmt(coins)}.`);
  for (const [id, n] of mats) takeCustom(player, id, n);
  if (ess) addEssence(player, -ess);
  player.setDynamicProperty(`eco:kitlvl:${line}`, t);
  if (t === 1) player.setDynamicProperty(`eco:kitclaim:${line}`, 0); // claim straight away
  invalidate(player);
  if (t === MAX_LEVEL) {
    success(player, `Your ${L.name} is now MAXED!`);
    player.onScreenDisplay?.setTitle?.("§6§lKIT MAXED!", { subtitle: `§e${L.name}`, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
  } else success(player, t === 1 ? `Unlocked the ${L.name}!` : `${L.name} upgraded to level ${t}!`);
  player.playSound("random.anvil_use");
}

// ---- kit preview: every item as a slot, hover to see it ------------------------
const VANILLA_NAMES = { luck_of_the_sea: "Luck of the Sea", fire_aspect: "Fire Aspect" };
const vanillaName = (e) => VANILLA_NAMES[e] ?? pretty(e);

/** Shows what a kit level gives: one slot per item (hover = its name, stats, enchants...). */
function kitPreviewMenu(player, line, t, back) {
  const L = LINES[line];
  const tiles = [];
  for (const spec of L.gear(t)) {
    const st = buildStack(spec);
    if (!st) continue;
    const lore = st.getLore().filter((l) => !l.startsWith("§8eco:"));
    const vanilla = Object.entries(spec.ench ?? {}).map(([e, l]) => `§7${vanillaName(e)} ${roman(l)}`);
    tiles.push({
      text: st.nameTag ?? pretty(st.typeId),
      sub: [...(vanilla.length ? [...vanilla, ""] : []), ...lore].join("\n"),
      icon: itemIcon(st.typeId),
      noClick: true,
      onClick: () => kitPreviewMenu(player, line, t, back),
    });
  }
  L.supplies(t).forEach(([id, n], i) =>
    tiles.push({ text: `§f${n}x ${pretty(id)}`, sub: "§7Supplies (kit item)", icon: itemIcon(id), newRow: i === 0, noClick: true, onClick: () => kitPreviewMenu(player, line, t, back) })
  );
  if (L.essence) tiles.push({ text: `§d${L.essence(t)} Essence`, sub: "§7Added to your Essence", icon: "textures/items/amethyst_shard", noClick: true, onClick: () => kitPreviewMenu(player, line, t, back) });
  const perk = Object.entries(perkStats(line, t)).map(([k, v]) => `§a+${v} ${k}`).join("\n");
  tiles.push({ text: "§6Kit Perk", sub: `${perk}\n§7${L.perkText}${t >= MAX_LEVEL ? "\n§6+25% (maxed)" : ""}`, icon: "textures/items/nether_star", newRow: true, noClick: true, onClick: () => kitPreviewMenu(player, line, t, back) });
  tiles.push(backTile(back));
  return tileMenu(player, {
    title: `${L.name} Level ${t}`,
    theme: "gold",
    body: `§6§l${L.name} - level ${t}${t >= MAX_LEVEL ? " (MAXED)" : ""}§r\n§7Hover over an item to see its stats and enchantments.`,
    tiles,
  });
}

// ---- menus -------------------------------------------------------------------
export async function kitUpgradesMenu(player, back) {
  const again = () => kitUpgradesMenu(player, back);
  await tileMenu(player, {
    title: "Kit Upgrades",
    theme: "gold",
    body: `§7Upgradable kits get better gear, more enchantments, more supplies and a bigger perk every level, up to §6§lMAXED§r§7 at level ${MAX_LEVEL}.\n§7Claim each kit every §e${CLAIM_HOURS}h§7.\n§7Purse: §a${fmtShort(getBalance(player))}`,
    tiles: [
      ...Object.entries(LINES).map(([id, L]) => {
        const t = kitLevel(player, id);
        const ready = t && lastClaim(player, id) + CLAIM_HOURS * HOUR <= Date.now();
        return {
          text: `${t >= MAX_LEVEL ? "§6" : t ? "§a" : "§7"}${L.name}`,
          sub: t >= MAX_LEVEL ? "§6§lMAXED" : t ? `§7Level §e${t}§7/§e${MAX_LEVEL}` : "§cLocked",
          lore: ready ? "§aReady to claim!" : undefined,
          icon: L.icon,
          badge: ready ? "NEW" : undefined,
          onClick: () => kitLineMenu(player, id, again),
        };
      }),
      backTile(back),
    ],
  });
}

async function kitLineMenu(player, line, back) {
  const again = () => kitLineMenu(player, line, back);
  const L = LINES[line];
  const t = kitLevel(player, line);
  const next = t + 1;
  const lines = [`§6§l${L.name}§r §7- level §e${t}§7/§e${MAX_LEVEL}${t >= MAX_LEVEL ? " §6§lMAXED" : ""}`];
  if (t) {
    const ps = perkStats(line, t);
    lines.push(`§7Perk: §a${Object.entries(ps).map(([k, v]) => `+${v} ${k}`).join(", ")} §8(${L.perkText}${t >= MAX_LEVEL ? ", +25% when maxed" : ""})`);
    const wait = lastClaim(player, line) + CLAIM_HOURS * HOUR - Date.now();
    lines.push(wait > 0 ? `§7Next claim in §e${Math.floor(wait / HOUR)}h ${Math.ceil((wait % HOUR) / 60000)}m` : "§aReady to claim!");
    lines.push("", "§fYou get:", ...contentsText(line, t));
  } else lines.push(`§7Perk: §a${L.perkText}`);
  const tiles = [];
  if (t) tiles.push({ text: "§aClaim Kit", sub: `§7Every ${CLAIM_HOURS}h`, icon: ICON.confirm, onClick: () => (claim(player, line), again()) });
  if (t) tiles.push({ text: `§eView Your Kit (Level ${t})`, sub: "§7See every item", icon: L.icon, onClick: () => kitPreviewMenu(player, line, t, again) });
  if (next <= MAX_LEVEL) {
    const coins = upgradeCost(line, next);
    const need = reqFor(line, next);
    const mats = L.mats?.[next] ?? [];
    const ess = L.upgradeEssence?.(next) ?? 0;
    const req = [
      `${getBalance(player) >= coins ? "§a" : "§c"}${fmt(coins)}`,
      `${reqLevel(player, line) >= need ? "§a" : "§c"}${reqName(line)} ${need}`,
      ...mats.map(([id, n]) => `${countCustom(player, id) >= n ? "§a" : "§c"}${n}x ${ITEMS[id].name}`),
      ...(ess ? [`${getEssence(player) >= ess ? "§a" : "§c"}${ess} Essence`] : []),
    ];
    tiles.push({
      text: t ? `§6Upgrade to Level ${next}` : `§6Unlock ${L.name}`,
      sub: req.join("\n"),
      icon: "textures/blocks/anvil_top_damaged_0",
      onClick: () => (upgrade(player, line), again()),
    });
    tiles.push({
      text: `§bPreview Level ${next}`,
      sub: "§7See what you'd get",
      icon: "textures/items/book_writable",
      onClick: () => kitPreviewMenu(player, line, next, again),
    });
  }
  tiles.push(backTile(back));
  await tileMenu(player, { title: L.name, theme: "gold", body: lines.join("\n"), tiles });
}

// ---- register ------------------------------------------------------------------
export function registerKitUpgrades() {
  statSources.push((player) => {
    const stats = {};
    for (const line of Object.keys(LINES)) {
      const t = kitLevel(player, line);
      if (!t || (LINES[line].dungeon && !inDungeon(player))) continue;
      for (const [k, v] of Object.entries(perkStats(line, t))) stats[k] = (stats[k] ?? 0) + v;
    }
    return Object.keys(stats).length ? { label: "Kit perks", stats } : undefined;
  });
  adminRpgTiles.push((player, back) => ({
    text: "§6§lKIT LEVELS",
    sub: "§7Set & reset cooldowns",
    icon: "textures/items/diamond_hoe",
    onClick: async () => {
      const ids = Object.keys(LINES);
      const form = new ModalFormData().title("Kit levels (0-10)");
      for (const id of ids) form.slider(LINES[id].name, 0, MAX_LEVEL, { valueStep: 1, defaultValue: kitLevel(player, id) });
      form.toggle("Reset claim cooldowns", { defaultValue: true });
      const res = await showForm(player, form);
      if (res && !res.canceled) {
        ids.forEach((id, i) => player.setDynamicProperty(`eco:kitlvl:${id}`, Math.round(Number(res.formValues[i]) || 0)));
        if (res.formValues[ids.length]) for (const id of ids) player.setDynamicProperty(`eco:kitclaim:${id}`, 0);
        invalidate(player);
        success(player, "Kit levels saved.");
      }
      return back();
    },
  }));
}

