import { ModalFormData } from "@minecraft/server-ui";
import { enchantMenu, giveCustom, reforgeMenu } from "./forge.js";
import { RARITIES, availableItems } from "./items.js";
import { itemIconFor } from "./forge.js";
import { PET_TYPES, activePet, addPet, petLevel, petsMenu } from "./pets.js";
import { SLAYERS, slayerLevel } from "./slayer.js";
import { getStats, statsMenu } from "./stats.js";
import { pickToolMenu } from "./tools.js";
import { adminSpiritTiles, spiritsMenu, wardrobeMenu } from "./extras.js";
import { adminElection } from "./mayor.js";
import { backTile, pagedMenu, showForm, success, tileMenu } from "./ui.js";

// ============================================================================
//  PROFILE  (main menu > Profile): stats, pets, reforge,
//  enchanting, plus tiles other systems add (wardrobe, spirits...).
//  ADMIN > RPG: give any custom item / pet, set slayer levels.
// ============================================================================

/** Other systems add tiles here: (player, back) => tile */
export const profileTiles = [];
/** Admin tools other systems add: (player, back) => tile */
export const adminRpgTiles = [];

export async function profileMenu(player, back) {
  const again = () => profileMenu(player, back);
  const t = getStats(player).total;
  const pet = activePet(player);
  const tiles = [
    { text: "§c§lSTATS", sub: `§c❤${Math.round(t.hp ?? 0)} §a❈${Math.round(t.def ?? 0)} §c❁${Math.round(t.str ?? 0)}`, icon: "textures/items/diamond_sword", onClick: () => statsMenu(player, again) },
    { text: "§a§lPETS", sub: pet ? `${RARITIES[pet.r].color}${PET_TYPES[pet.t].name} §7Lv${petLevel(pet.xp, pet.r).level}` : "§7No active pet", icon: "textures/items/bone", onClick: () => petsMenu(player, again) },
    { text: "§6§lREFORGE", sub: "§7Pick an item", icon: "textures/blocks/anvil_top_damaged_0", onClick: () => reforgeMenu(player, again) },
    { text: "§d§lENCHANTING", sub: "§7Pick an item", icon: "textures/items/book_enchanted", onClick: () => enchantMenu(player, again) },
    { text: "§a§lSKILL TOOL UPGRADES", sub: "§7Farming Hoe & Slayer Sword", icon: "textures/items/wood_hoe", onClick: () => pickToolMenu(player, again) },
  ];
  tiles.push(
    { text: "§b§lWARDROBE", sub: "§7Swap armor sets", icon: "textures/items/iron_chestplate", onClick: () => wardrobeMenu(player, again) },
    { text: "§b§lSPIRITS", sub: "§7Hidden collectibles", icon: "textures/items/nether_star", onClick: () => spiritsMenu(player, again) }
  );
  for (const f of profileTiles) {
    try {
      const tile = f(player, again);
      if (tile) tiles.push(tile);
    } catch {}
  }
  tiles.push(backTile(back));
  const slayer = Object.keys(SLAYERS).map((k) => slayerLevel(player, k)).join("/");
  await tileMenu(player, {
    title: "PROFILE",
    theme: "red",
    body: `§f§l${player.name}§r\n§7Slayer levels: §5${slayer}\n§7Reforge, Enchanting and Skill Tool Upgrades let you pick the item from your inventory.`,
    tiles,
  });
}

// ---- admin ---------------------------------------------------------------------
export async function adminRpgMenu(player, back) {
  const again = () => adminRpgMenu(player, back);
  const tiles = [
    {
      text: "§6§lGIVE ITEM",
      sub: "§7Any custom item",
      icon: "textures/items/diamond_sword",
      onClick: () =>
        pagedMenu(player, {
          title: "GIVE ITEM",
          theme: "red",
          body: "§7Tap to get one (materials: 64).",
          tiles: availableItems().map((d) => ({
            text: `${RARITIES[d.rarity].color}${d.name.slice(0, 18)}`,
            sub: `§8${d.id}`,
            icon: itemIconFor(d),
            onClick: () => {
              giveCustom(player, d.id, d.kind === "material" ? 64 : 1);
              success(player, `Gave you ${d.name}.`);
              return again();
            },
          })),
          back: again,
        }),
    },
    {
      text: "§a§lGIVE PET",
      sub: "§7Any pet, any rarity",
      icon: "textures/items/bone",
      onClick: async () => {
        const types = Object.keys(PET_TYPES);
        const res = await showForm(
          player,
          new ModalFormData()
            .title("Give pet")
            .dropdown("Pet", types.map((t) => PET_TYPES[t].name), { defaultValueIndex: 0 })
            .dropdown("Rarity", RARITIES.slice(0, 5).map((r) => r.name), { defaultValueIndex: 4 })
            .textField("XP (0 = level 1, 400000 = about level 100)", "0", { defaultValue: "0" })
        );
        if (res && !res.canceled) {
          const t = types[Number(res.formValues[0]) || 0];
          addPet(player, t, Number(res.formValues[1]) || 0, Math.max(0, Number(res.formValues[2]) || 0));
          success(player, `Added a ${PET_TYPES[t].name} pet to your Pet Menu.`);
        }
        return again();
      },
    },
    {
      text: "§5§lSLAYER XP",
      sub: "§7Set your own",
      icon: "textures/items/eco_heads/zombie",
      onClick: async () => {
        const types = Object.keys(SLAYERS);
        const res = await showForm(
          player,
          new ModalFormData()
            .title("Slayer XP")
            .dropdown("Slayer", types.map((t) => SLAYERS[t].name), { defaultValueIndex: 0 })
            .textField("Slayer XP (Lv1 5, Lv3 50, Lv5 500, Lv9 25000)", "500", { defaultValue: "500" })
        );
        if (res && !res.canceled) {
          const t = types[Number(res.formValues[0]) || 0];
          player.setDynamicProperty(`eco:slxp:${t}`, Math.max(0, Number(res.formValues[1]) || 0));
          success(player, `Set your ${SLAYERS[t].name} Slayer XP.`);
        }
        return again();
      },
    },
  ];
  tiles.push(...adminSpiritTiles(player, again));
  tiles.push({ text: "§6§lELECTION", sub: "§7Mayor tools", icon: "textures/items/gold_nugget", onClick: () => adminElection(player, again) });
  for (const f of adminRpgTiles) {
    try {
      const tile = f(player, again);
      if (tile) tiles.push(tile);
    } catch {}
  }
  tiles.push(backTile(back));
  await tileMenu(player, { title: "ADMIN - RPG", theme: "red", body: "§7Test tools for items, pets, slayer, dungeons and more.", tiles });
}

