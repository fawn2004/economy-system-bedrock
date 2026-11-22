import { fmt, fmtShort, getBalance, takeMoney } from "./economy.js";
import { itemIcon } from "./itemData.js";
import { addEssence, getEssence } from "./dungeons.js";
import { container, freeSlots } from "./inventory.js";
import { ENCHANTS, ITEMS, RARITIES, enchantChance, REFORGES, REFORGE_COST, STATS, availableItems, enchantsFor, itemStats, makeItem, readItem, reforgesFor, renderItem, roman } from "./items.js";
import { ICON, backTile, fail, pagedMenu, success, tileMenu } from "./ui.js";

// ============================================================================
//  REFORGE ANVIL, ENCHANTING and the EQUIPMENT / ACCESSORY shops
//  Reforge: random reforge for the held weapon / armor / tool (cost by rarity).
//  Enchant: custom enchantments for coins + XP levels.
// ============================================================================

const clip = (s, n = 18) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function held(player) {
  const inv = container(player);
  const slot = player.selectedSlotIndex;
  const item = inv?.getItem(slot);
  return { inv, slot, item, info: readItem(item) };
}

const statsLine = (st) =>
  Object.entries(st)
    .filter(([, v]) => v)
    .map(([k, v]) => `${STATS[k]?.color ?? "§7"}+${v}${STATS[k]?.pct ? "%" : ""} ${STATS[k]?.name ?? k}`)
    .join("§7, ") || "§8none";

export async function reforgeMenu(player, back) {
  const again = () => reforgeMenu(player, back);
  const { inv, slot, item, info } = held(player);
  if (!item || !info || !reforgesFor(info.kind).length) {
    return tileMenu(player, {
      title: "REFORGE ANVIL",
      theme: "orange",
      body: "§7Hold a §fweapon§7, §farmor piece§7 or §ftool§7 and open this again.\n§7Reforging gives it a random reforge with extra stats. Better rarity = bigger stats (and cost).\n\n§7Reforges: " +
        Object.values(REFORGES).map((r) => `§f${r.name} §8(${r.for})`).join("§7, "),
      tiles: [backTile(back)],
    });
  }
  const cost = REFORGE_COST[info.rarity];
  const cur = REFORGES[info.reforge];
  await tileMenu(player, {
    title: "REFORGE ANVIL",
    theme: "orange",
    body: [
      `§7Item: ${RARITIES[info.rarity].color}${item.nameTag?.replace(/§./g, "") || item.typeId}`,
      `§7Current reforge: ${cur ? "§f" + cur.name : "§8none"}`,
      cur ? `§7Its stats: ${statsLine(Object.fromEntries(Object.entries(cur.stats).map(([k, v]) => [k === "fortune" ? "mfo" : k, v[info.rarity]])))}` : "",
      `§7Cost: ${getBalance(player) >= cost ? "§a" : "§c"}${fmt(cost)}`,
      "§8You get a random reforge (never the same one twice in a row).",
    ].filter(Boolean).join("\n"),
    tiles: [
      {
        text: "§6§lREFORGE",
        sub: `§a${fmtShort(cost)}`,
        icon: "textures/blocks/anvil_top_damaged_0",
        onClick: () => {
          const now = inv.getItem(slot);
          if (!now || now.typeId !== item.typeId || now.nameTag !== item.nameTag) {
            fail(player, "Keep holding the item.");
            return again();
          }
          if (!takeMoney(player, cost)) {
            fail(player, `You need ${fmt(cost)}.`);
            return again();
          }
          const pool = reforgesFor(info.kind).filter((r) => r !== info.reforge);
          const pick = pool[Math.floor(Math.random() * pool.length)];
          const ni = readItem(now);
          ni.reforge = pick;
          renderItem(now, ni);
          inv.setItem(slot, now);
          success(player, `Reforged into ${REFORGES[pick].name}!`);
          player.playSound("random.anvil_use");
          return again();
        },
      },
      backTile(back),
    ],
  });
}

/** Cost of enchanting to `next`: dungeon gear pays Essence + some coins, everything else coins + XP levels. */
function enchantCost(e, next, dungeonItem) {
  if (dungeonItem) return { coins: Math.round((e.cost * next * next) / 4), xp: 0, essence: Math.round((e.cost / 100) * next) };
  return { coins: e.cost * next * next, xp: e.xp * next, essence: 0 };
}

function costText(c) {
  const parts = [`§a${fmtShort(c.coins)}`];
  if (c.xp) parts.push(`§b${c.xp}L`);
  if (c.essence) parts.push(`§d${c.essence} Ess`);
  return parts.join(" ");
}

export async function enchantMenu(player, back) {
  const again = () => enchantMenu(player, back);
  const { inv, slot, item, info } = held(player);
  if (!item || !info || !enchantsFor(info.kind).length) {
    return tileMenu(player, {
      title: "ENCHANTING",
      theme: "purple",
      body:
        "§7Hold a §fweapon§7, §farmor piece§7, §ftool§7 or §ffishing rod§7 and open this again.\n" +
        "§7Each custom enchantment has a §echance to work§7 - higher levels are riskier. You pay either way.\n" +
        "§7Dungeon gear costs §dEssence§7, everything else coins and XP levels.",
      tiles: [backTile(back)],
    });
  }
  const dungeonItem = !!info.def?.dungeon;
  const essence = getEssence(player);
  const tiles = enchantsFor(info.kind).map((code) => {
    const e = ENCHANTS[code];
    const lvl = info.ench[code] ?? 0;
    if (lvl >= e.max) return { text: `§5${clip(e.name)}`, sub: `§6${roman(lvl)} MAX\n§7${e.desc}`, icon: "textures/items/book_enchanted", noClick: true, onClick: again };
    const next = lvl + 1;
    const c = enchantCost(e, next, dungeonItem);
    const chance = Math.round(enchantChance(next) * 100);
    const can = getBalance(player) >= c.coins && player.level >= c.xp && essence >= c.essence;
    return {
      text: `§d${clip(e.name)} ${roman(next)}`,
      sub: `${can ? "" : "§c"}${costText(c)}\n§e${chance}% chance\n§7${e.desc}`,
      icon: "textures/items/book_enchanted",
      onClick: async () => {
        const ok = await tileMenu(player, {
          title: `${e.name.toUpperCase()} ${roman(next)}`,
          theme: "purple",
          body:
            `§7${e.desc}\n` +
            `§7Chance to work: §e§l${chance}%§r\n` +
            `§7Cost: ${costText(c)} §8(you have ${fmtShort(getBalance(player))}${c.xp ? `, ${player.level}L` : ""}${c.essence ? `, ${essence} Essence` : ""})\n` +
            "§cIf it fails you still pay, and the item stays the same.",
          tiles: [
            { text: "§a§lTRY ENCHANT", sub: `${costText(c)} §e${chance}%`, icon: ICON.confirm, id: "yes" },
            { text: "§c§lCANCEL", sub: "§7Go back", icon: ICON.cancel },
          ],
        });
        if (ok?.id !== "yes") return again();
        const now = inv.getItem(slot);
        if (!now || now.typeId !== item.typeId || now.nameTag !== item.nameTag) {
          fail(player, "Keep holding the item.");
          return again();
        }
        if (player.level < c.xp) {
          fail(player, `You need ${c.xp} XP levels.`);
          return again();
        }
        if (getEssence(player) < c.essence) {
          fail(player, `You need ${c.essence} Essence.`);
          return again();
        }
        if (!takeMoney(player, c.coins)) {
          fail(player, `You need ${fmt(c.coins)}.`);
          return again();
        }
        if (c.xp) player.addLevels(-c.xp);
        if (c.essence) addEssence(player, -c.essence);
        if (Math.random() >= enchantChance(next)) {
          fail(player, `The ${e.name} ${roman(next)} enchantment failed! Your payment was used up and the item didn't change.`);
          player.playSound("random.anvil_break");
          return again();
        }
        const ni = readItem(now);
        ni.ench[code] = next;
        renderItem(now, ni);
        inv.setItem(slot, now);
        success(player, `Success! ${e.name} ${roman(next)} was added.`);
        player.playSound("random.levelup");
        return again();
      },
    };
  });
  tiles.push(backTile(back));
  await tileMenu(player, {
    title: "ENCHANTING",
    theme: "purple",
    body:
      `§7Item: ${RARITIES[info.rarity].color}${item.nameTag?.replace(/§./g, "") || item.typeId}\n` +
      (dungeonItem ? `§7Dungeon gear: pays §dEssence§7 (you have §d${essence}§7)\n` : `§7XP levels: §b${player.level}\n`) +
      "§7Every attempt has a §echance to work§7 (lower at higher levels). §cA failed attempt still costs.",
    tiles,
  });
}

// ---- shops ----------------------------------------------------------------------------
export function describeItem(def) {
  const lines = [`${RARITIES[def.rarity].color}§l${def.name}§r`];
  const st = itemStats({ def, kind: def.kind, rarity: def.rarity, ench: {} });
  for (const [k, v] of Object.entries(st)) lines.push(`§7${STATS[k].name}: ${STATS[k].color}+${v}${STATS[k].pct ? "%" : ""}`);
  if (def.ability) lines.push(`§6Ability: ${def.ability.name} §8(${def.ability.mana} mana) §7- ${def.ability.desc}`);
  if (def.desc) lines.push(`§7${def.desc}`);
  if (def.family) lines.push("§8Accessory: goes in your Accessory Bag. Only the best of each family counts.");
  return lines.join("\n");
}

export const itemIconFor = (def) => itemIcon(def.item);

export async function itemShopMenu(player, shopId, title, back) {
  const again = () => itemShopMenu(player, shopId, title, back);
  const list = availableItems().filter((d) => d.shop === shopId).sort((a, b) => a.price - b.price);
  await pagedMenu(player, {
    title,
    theme: shopId === "accessories" ? "purple" : "red",
    body: `§7Purse: §a${fmt(getBalance(player))}`,
    tiles: list.map((d) => ({
      text: `${RARITIES[d.rarity].color}${clip(d.name)}`,
      sub: `${getBalance(player) >= d.price ? "§a" : "§c"}${fmtShort(d.price)}`,
      icon: itemIconFor(d),
      onClick: async () => {
        const ok = await tileMenu(player, {
          title: clip(d.name.toUpperCase(), 24),
          theme: shopId === "accessories" ? "purple" : "red",
          body: describeItem(d) + `\n\n§7Price: §a${fmt(d.price)}`,
          tiles: [
            { text: "§a§lBUY", sub: `§a${fmtShort(d.price)}`, icon: ICON.confirm, id: "yes" },
            backTile(),
          ],
        });
        if (ok?.id === "yes") {
          if (freeSlots(player) < 1) fail(player, "You need a free inventory slot.");
          else if (!takeMoney(player, d.price)) fail(player, `You need ${fmt(d.price)}.`);
          else {
            container(player).addItem(makeItem(d.id));
            success(player, `Bought ${d.name}!`);
          }
        }
        return again();
      },
    })),
    back,
  });
}

/** Gives a custom item (admin tools, rewards). */
export function giveCustom(player, id, amount = 1) {
  const st = makeItem(id, amount);
  if (!st) return false;
  const over = container(player)?.addItem(st);
  if (over) player.dimension.spawnItem(over, player.location);
  return true;
}

export { ITEMS };
