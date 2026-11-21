#!/usr/bin/env python3
"""
Generates buy & sell prices for EVERY survival-obtainable item, from Mojang's
official Bedrock data (https://github.com/Mojang/bedrock-samples).

    git clone --depth 1 https://github.com/Mojang/bedrock-samples.git /tmp/bs
    python3 tools/generate_prices.py /tmp/bs

Output: packs/SkyblockEconomy_BP/scripts/prices.js

How prices are made
-------------------
1. Raw materials (things no recipe makes: logs, ores' drops, mob drops, crops...)
   get a hand-set base value in BASE below.
2. Every crafted / smelted / smithed / brewed item is valued at the cheapest way
   to make it from its ingredients (all 1,800+ vanilla recipes).
3. buy = value,  sell = value * SELL_RATIO.
4. ANTI-PROFIT CHECK: for every recipe (and uncrafting, smelting, stripping logs,
   filling buckets, mining ores with Fortune III ...) we make sure
        sum(sell price of everything it makes) <= sum(buy price of its ingredients)
   Any sell price that breaks this is lowered until it holds. So buying items,
   crafting them into something else and selling can never make money.
"""
import json
import glob
import math
import os
import re
import sys
from collections import defaultdict

SELL_RATIO = 0.5  # sell price = 50% of buy price (before the anti-profit check)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "packs", "SkyblockEconomy_BP", "scripts", "prices.js")

COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
          "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"]
DYE_DATA = {0: "ink_sac", 1: "red_dye", 2: "green_dye", 3: "cocoa_beans", 4: "lapis_lazuli",
            5: "purple_dye", 6: "cyan_dye", 7: "light_gray_dye", 8: "gray_dye", 9: "pink_dye",
            10: "lime_dye", 11: "yellow_dye", 12: "light_blue_dye", 13: "magenta_dye",
            14: "orange_dye", 15: "bone_meal", 16: "black_dye", 17: "brown_dye",
            18: "blue_dye", 19: "white_dye"}
WOODS6 = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak"]

# ---------------------------------------------------------------------------
#  Items that can't be obtained in survival (or are technical) - never sold
# ---------------------------------------------------------------------------
EXCLUDE_EXACT = {
    "allow", "deny", "border_block", "barrier", "bedrock", "command_block", "chain_command_block",
    "repeating_command_block", "command_block_minecart", "structure_block", "structure_void", "jigsaw",
    "end_portal_frame", "reinforced_deepslate", "budding_amethyst", "frosted_ice", "mob_spawner",
    "trial_spawner", "vault", "petrified_oak_slab", "farmland", "grass_path", "knowledge_book",
    "debug_stick", "player_head", "frog_spawn", "filled_map", "lodestone_compass", "camera",
    "portfolio", "chalkboard", "board", "photo", "npc_spawn_egg", "agent_spawn_egg",
    "glow_stick", "sparkler", "balloon", "medicine", "bleach", "ice_bomb", "compound",
    "chemistry_table", "compound_creator", "element_constructor", "lab_table", "material_reducer",
    "rapid_fertilizer", "underwater_torch", "underwater_tnt", "colored_torch_red", "colored_torch_green",
    "colored_torch_blue", "colored_torch_purple", "colored_torch_bp", "colored_torch_rg",
    "unknown", "info_update", "info_update2", "client_request_placeholder_block", "moving_block",
    "piston_arm_collision", "sticky_piston_arm_collision", "suspicious_sand", "suspicious_gravel",
    "netherreactor", "glowingobsidian", "stonecutter", "reserved6", "end_gateway", "end_portal",
    "portal", "fire", "soul_fire", "water", "lava", "flowing_water", "flowing_lava", "spawn_egg",
    "ominous_trial_key", "trial_key", "bundle_empty",
}
EXCLUDE_RE = re.compile(
    r"(spawn_egg$|^element_|^light_block|^infested_|^hard_.*glass|^colored_torch|^lit_|^unlit_|"
    r"^powered_|_wall_sign$|^wall_|standing_sign$|standing_banner|^double_|_double_slab$|"
    r"^item\.|^chemical_heat|^deprecated|^tile\.)"
)

# ---------------------------------------------------------------------------
#  Base values for raw materials (things no recipe makes)
# ---------------------------------------------------------------------------
BASE = {
    # natural blocks
    # (Skyblock: dirt, sand, gravel, clay & saplings are scarce on an island, so they're pricier)
    "dirt": 5, "grass_block": 6, "podzol": 8, "mycelium": 10, "dirt_with_roots": 6, "coarse_dirt": 5,
    "sand": 5, "red_sand": 6, "gravel": 5, "clay_ball": 5, "snowball": 1, "ice": 10,
    "cobblestone": 2, "stone": 3, "deepslate": 2, "cobbled_deepslate": 2, "tuff": 2, "calcite": 3,
    "granite": 2, "diorite": 2, "andesite": 2, "blackstone": 2, "basalt": 2, "netherrack": 1,
    "soul_sand": 3, "soul_soil": 3, "end_stone": 4, "obsidian": 60, "crying_obsidian": 80,
    "pointed_dripstone": 2, "mud": 6, "moss_block": 1, "pale_moss_block": 1, "sculk": 6,
    "sculk_vein": 2, "sculk_sensor": 150, "sculk_catalyst": 400, "sculk_shrieker": 400,
    "magma": 10, "gilded_blackstone": 30, "crimson_nylium": 2, "warped_nylium": 2,
    "cinnabar": 4, "sulfur_spike": 4, "icicle": 2, "ice_crystal": 4, "ice_ball": 2,
    # wood & plants
    "_log": 4, "_stem": 4, "bamboo": 3, "_leaves": 1, "_sapling": 25, "mangrove_propagule": 25,
    "azalea": 4, "flowering_azalea": 5, "crimson_fungus": 3, "warped_fungus": 3,
    "crimson_roots": 1, "warped_roots": 1, "nether_sprouts": 1, "twisting_vines": 1,
    "weeping_vines": 1, "vine": 1, "glow_lichen": 1, "hanging_roots": 1, "pale_hanging_moss": 1,
    "short_grass": 1, "tall_grass": 1, "fern": 1, "large_fern": 1, "deadbush": 1, "bush": 1,
    "short_dry_grass": 1, "tall_dry_grass": 1, "firefly_bush": 4, "seagrass": 1, "kelp": 1,
    "waterlily": 2, "sea_pickle": 2, "big_dripleaf": 3, "small_dripleaf_block": 3,
    "spore_blossom": 40, "mangrove_roots": 2, "brown_mushroom": 1, "red_mushroom": 1,
    "brown_mushroom_block": 1, "red_mushroom_block": 1, "mushroom_stem": 1, "shroomlight": 20,
    "chorus_plant": 2, "chorus_flower": 15, "chorus_fruit": 3, "cactus_flower": 2, "shelf_mushroom": 2,
    "pink_petals": 1, "wildflowers": 1, "leaf_litter": 1,
    # flowers
    "dandelion": 1, "poppy": 1, "blue_orchid": 1, "allium": 1, "azure_bluet": 1, "red_tulip": 1,
    "orange_tulip": 1, "white_tulip": 1, "pink_tulip": 1, "oxeye_daisy": 1, "cornflower": 1,
    "lily_of_the_valley": 1, "sunflower": 2, "lilac": 2, "rose_bush": 2, "peony": 2,
    "wither_rose": 50, "torchflower": 20, "pitcher_plant": 30, "open_eyeblossom": 3,
    "closed_eyeblossom": 3, "red_shrub": 1,
    # crops & food
    "wheat_seeds": 1, "beetroot_seeds": 1, "pumpkin_seeds": 1, "melon_seeds": 1, "wheat": 2,
    "carrot": 2, "potato": 2, "poisonous_potato": 1, "beetroot": 2, "melon_slice": 1, "pumpkin": 6,
    "sugar_cane": 5, "cactus": 5, "cocoa_beans": 3, "nether_wart": 4, "sweet_berries": 2,
    "glow_berries": 3, "apple": 6, "egg": 3, "blue_egg": 3, "brown_egg": 3, "torchflower_seeds": 20,
    "pitcher_pod": 30, "beef": 5, "porkchop": 5, "chicken": 4, "mutton": 4, "rabbit": 4, "cod": 4,
    "salmon": 5, "tropical_fish": 6, "pufferfish": 8, "cooked_cod": 4, "cooked_mutton": 4,
    "honeycomb": 10, "enchanted_golden_apple": 25000,
    # minerals
    "coal": 8, "charcoal": 8, "raw_iron": 30, "raw_gold": 40, "raw_copper": 6, "iron_ingot": 30,
    "gold_ingot": 40, "copper_ingot": 6, "redstone": 4, "lapis_lazuli": 4, "quartz": 6,
    "diamond": 200, "emerald": 150, "amethyst_shard": 8, "netherite_scrap": 600,
    "ancient_debris": 600, "glowstone_dust": 6, "flint": 2, "prismarine_shard": 6,
    "prismarine_crystals": 8, "amethyst_cluster": 4, "large_amethyst_bud": 3,
    "medium_amethyst_bud": 2, "small_amethyst_bud": 1, "iron_nugget": 3, "gold_nugget": 4,
    "copper_nugget": 1,
    # mob drops
    "rotten_flesh": 2, "bone": 12, "string": 6, "spider_eye": 6, "gunpowder": 10, "ender_pearl": 30,
    "blaze_rod": 40, "breeze_rod": 40, "slime_ball": 15, "leather": 10, "feather": 3, "ink_sac": 6,
    "glow_ink_sac": 15, "ghast_tear": 80, "phantom_membrane": 40, "shulker_shell": 300,
    "nether_star": 50000, "rabbit_hide": 5, "rabbit_foot": 50, "turtle_scute": 200,
    "armadillo_scute": 40, "nautilus_shell": 400, "heart_of_the_sea": 5000, "echo_shard": 200,
    "dragon_breath": 200, "totem_of_undying": 2000, "trident": 8000, "elytra": 150000,
    "dragon_egg": 1000000, "heavy_core": 20000, "goat_horn": 500, "sniffer_egg": 2000,
    "turtle_egg": 200, "wool": 8, "_wool": 8, "web": 10, "experience_bottle": 30, "ominous_bottle": 500,
    "creeper_head": 3000, "zombie_head": 1000, "skeleton_skull": 1000, "wither_skeleton_skull": 5000,
    "piglin_head": 2000, "dragon_head": 50000, "resin_clump": 4, "creaking_heart": 500,
    "bee_nest": 50, "warped_wart_block": 1, "azalea_leaves_flowered": 1,
    # coral & ocean
    "_coral": 3, "_coral_fan": 3, "_coral_block": 6, "dead_": 2,
    # treasure / loot
    "_pottery_sherd": 300, "music_disc_": 1000, "disc_fragment_5": 120, "_banner_pattern": 300,
    "_horse_armor": 1500, "_nautilus_armor": 1500, "saddle": 500, "name_tag": 300,
    "enchanted_book": 150, "_smithing_template": 2000, "chainmail_": 400,
    "golden_horse_armor": 1500, "leather_horse_armor": 80, "bell": 500, "sponge": 300,
    "wet_sponge": 300, "heart_of_the_sea": 5000, "ochre_froglight": 50, "verdant_froglight": 50,
    "pearlescent_froglight": 50, "copper_golem_statue": 60, "egg_": 3,
}

# Blocks that drop other items when mined: block -> [(item, max drops with Fortune III)]
DROPS = {
    "coal_ore": [("coal", 4)], "deepslate_coal_ore": [("coal", 4)],
    "iron_ore": [("raw_iron", 4)], "deepslate_iron_ore": [("raw_iron", 4)],
    "copper_ore": [("raw_copper", 20)], "deepslate_copper_ore": [("raw_copper", 20)],
    "gold_ore": [("raw_gold", 4)], "deepslate_gold_ore": [("raw_gold", 4)],
    "redstone_ore": [("redstone", 8)], "deepslate_redstone_ore": [("redstone", 8)],
    "lapis_ore": [("lapis_lazuli", 36)], "deepslate_lapis_ore": [("lapis_lazuli", 36)],
    "diamond_ore": [("diamond", 4)], "deepslate_diamond_ore": [("diamond", 4)],
    "emerald_ore": [("emerald", 4)], "deepslate_emerald_ore": [("emerald", 4)],
    "nether_gold_ore": [("gold_nugget", 24)], "quartz_ore": [("quartz", 4)],
    "ancient_debris": [("netherite_scrap", 1)], "gilded_blackstone": [("gold_nugget", 5)],
    "amethyst_cluster": [("amethyst_shard", 16)], "glowstone": [("glowstone_dust", 4)],
    "sea_lantern": [("prismarine_crystals", 5)], "melon_block": [("melon_slice", 9)],
    "gravel": [("flint", 1)], "clay": [("clay_ball", 4)], "snow": [("snowball", 4)],
    "bookshelf": [("book", 3)], "ender_chest": [("obsidian", 8)], "grass_block": [("dirt", 1)],
    "mycelium": [("dirt", 1)], "podzol": [("dirt", 1)], "pumpkin": [("carved_pumpkin", 1), ("pumpkin_seeds", 4)],
    "nether_wart_block": [("nether_wart", 0)], "dirt_with_roots": [("dirt", 1), ("hanging_roots", 1)],
}

# Containers handed back when a filled one is used in crafting
CONTAINER = {"milk_bucket": "bucket", "water_bucket": "bucket", "lava_bucket": "bucket",
             "powder_snow_bucket": "bucket", "honey_bottle": "glass_bottle", "potion": "glass_bottle",
             "dragon_breath": "glass_bottle"}

# ---------------------------------------------------------------------------
#  Shop categories (first matching rule wins)
# ---------------------------------------------------------------------------
CATEGORY_RULES = [
    ("treasure", r"(_smithing_template$|_pottery_sherd$|^music_disc_|^disc_fragment|_banner_pattern$|"
                 r"^enchanted_book$|^sponge$|^wet_sponge$|^conduit$|^dragon_egg$|^heart_of_the_sea$|^nether_star$|"
                 r"^totem_of_undying$|^enchanted_golden_apple$|^heavy_core$|^echo_shard$|^ominous_bottle$)"),
    ("tools", r"_spear$"),
    ("ores", r"(_ore$|^raw_|_ingot$|^diamond$|^emerald$|^coal$|^charcoal$|^redstone$|^lapis_lazuli$|^quartz$|"
             r"amethyst|_nugget$|netherite_scrap|ancient_debris|^(iron|gold|copper|diamond|emerald|coal|"
             r"redstone|lapis|netherite|raw_iron|raw_gold|raw_copper)_block$|^flint$|glowstone_dust|prismarine_(shard|crystals))"),
    ("tools", r"(_sword$|_pickaxe$|_axe$|_shovel$|_hoe$|_helmet$|_chestplate$|_leggings$|_boots$|^bow$|^crossbow$|"
              r"^arrow$|^spectral_arrow$|^shield$|^trident$|^mace$|^elytra$|^fishing_rod$|^shears$|^flint_and_steel$|"
              r"^brush$|^spyglass$|^compass$|^recovery_compass$|^clock$|^lead$|^saddle$|_horse_armor$|_nautilus_armor$|"
              r"^turtle_helmet$|^totem_of_undying$|^wolf_armor$|^carrot_on_a_stick$|^warped_fungus_on_a_stick$|"
              r"^wind_charge$|^fire_charge$|^name_tag$|_harness$|^bundle$|_bundle$|^empty_map$|^map$)"),
    ("redstone", r"(redstone|piston|observer|repeater|comparator|hopper|dropper|dispenser|lever|_button$|"
                 r"pressure_plate|daylight_detector|tripwire|target|^tnt$|_rail$|^rail$|minecart|note|noteblock|"
                 r"^lectern$|sculk_sensor|calibrated|lightning_rod|crafter|^copper_bulb|_copper_bulb|trapped_chest|"
                 r"^bell$)"),
    ("food", r"(^cooked_|^baked_potato$|^bread$|^cake$|^cookie$|pie$|_stew$|_soup$|^golden_apple$|"
             r"^enchanted_golden_apple$|^golden_carrot$|^apple$|^beef$|^porkchop$|^chicken$|^mutton$|^rabbit$|"
             r"^cod$|^salmon$|^tropical_fish$|^pufferfish$|^dried_kelp$|^honey_bottle$|^chorus_fruit$|"
             r"^sweet_berries$|^glow_berries$|^melon_slice$|^poisonous_potato$|^rotten_flesh$|^spider_eye$|^sugar$)"),
    ("farming", r"(seeds$|^wheat$|^carrot$|^potato$|^beetroot$|^pumpkin$|^melon_block$|^sugar_cane$|^cactus$|"
                r"^cocoa_beans$|^nether_wart$|^bone_meal$|^bone_block$|^hay_block$|_sapling$|^mangrove_propagule$|"
                r"^bamboo$|^kelp$|^composter$|^beehive$|^bee_nest$|^honeycomb$|^egg$|_egg$|^pitcher_pod$|"
                r"_bucket$|^bucket$|^dirt$|^grass_block$|^podzol$|^mycelium$|^coarse_dirt$|^rooted_dirt$|"
                r"^dirt_with_roots$|^moss_block$|^mud$|_fungus$|^sea_pickle$|^cactus_flower$)"),
    ("mobs", r"(^bone$|^string$|^gunpowder$|^ender_pearl$|^ender_eye$|^blaze_rod$|^blaze_powder$|^breeze_rod$|"
             r"^slime_ball$|^leather$|^feather$|^ink_sac$|^glow_ink_sac$|^ghast_tear$|^phantom_membrane$|"
             r"^shulker_shell$|^nether_star$|^rabbit_hide$|^rabbit_foot$|_scute$|^nautilus_shell$|^heart_of_the_sea$|"
             r"^echo_shard$|^heavy_core$|^goat_horn$|_head$|_skull$|^magma_cream$|^web$|^dragon_egg$|^scute$)"),
    ("brewing", r"(potion|^glass_bottle$|^brewing_stand$|^cauldron$|^fermented_spider_eye$|^glistering_melon_slice$|"
                r"^dragon_breath$|^experience_bottle$|^ominous_bottle$|^blaze_powder$)"),
    ("colored", r"(^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|"
                r"green|red|black|silver)_|_dye$|^glass$|^glass_pane$|^terracotta$|^hardened_clay$|^candle$|^tinted_glass$|"
                r"^shulker_box$|^undyed_shulker_box$|^bed$|^banner$)"),
    ("wood", r"(oak|spruce|birch|jungle|acacia|cherry|mangrove|bamboo|crimson|warped|poplar|_log$|_wood$|_stem$|"
             r"_hyphae$|_planks$|^stick$|^bowl$|^crafting_table$|^chest$|^barrel$|^ladder$|^scaffolding$|"
             r"^wooden_|_sign$|_shelf$|boat$|raft$|_door$|_trapdoor$|_fence|^campfire$|^soul_campfire$)"),
    ("nether", r"(nether|blackstone|basalt|soul_|crimson|warped|magma|shroomlight|glowstone|quartz|"
               r"respawn_anchor|crying_obsidian|wither_rose|^lodestone$)"),
    ("end", r"(end_|purpur|chorus|shulker|ender_chest|dragon|elytra|^beacon$)"),
    ("stone", r"(stone|cobble|granite|diorite|andesite|deepslate|tuff|calcite|brick|^smooth_|polished_|"
              r"prismarine|sandstone|^sand$|^red_sand$|^gravel$|^clay$|^obsidian$|dripstone|^mud|^packed_mud$|"
              r"concrete|copper|^chiseled_|^cut_|^ice$|^packed_ice$|^blue_ice$|^snow|amethyst_block|^resin)"),
    ("decor", r"."),
]
CATEGORY_INFO = {
    # id: (name, description, icon, theme, group)   group "blocks" = shown inside the Blocks tile
    "stone":    ("Stone",        "Stone, bricks & building blocks", "textures/blocks/stonebrick", "blue", "blocks"),
    "wood":     ("Wood",         "Logs, planks & wooden things",    "textures/blocks/log_oak", "orange", "blocks"),
    "colored":  ("Colours",      "Wool, glass, concrete & dyes",     "textures/blocks/wool_colored_red", "purple", "blocks"),
    "nether":   ("Nether",       "Blocks from the Nether",           "textures/blocks/netherrack", "red", "blocks"),
    "end":      ("The End",      "End stone, purpur & more",         "textures/blocks/end_stone", "purple", "blocks"),
    "decor":    ("Decoration",   "Plants, lights & decoration",      "textures/blocks/flower_rose", "green", "blocks"),
    "treasure": ("Treasure",     "Rare loot, templates & discs",     "textures/items/nether_star", "gold", None),
    "ores":     ("Ores",         "Ores, ingots & gems",              "textures/items/diamond", "blue", None),
    "tools":    ("Tools & Armor","Tools, weapons & armour",          "textures/items/diamond_sword", "red", None),
    "redstone": ("Redstone",     "Redstone parts & machines",        "textures/items/redstone_dust", "red", None),
    "food":     ("Food",         "Keep your island fed",            "textures/ui/eco/icon_food", "orange", None),
    "farming":  ("Farming",      "Seeds, crops & farm gear",         "textures/ui/eco/icon_farming", "green", None),
    "mobs":     ("Mob Drops",    "Loot from mobs",                   "textures/items/rotten_flesh", "green", None),
    "brewing":  ("Brewing",      "Potions & ingredients",            "textures/items/potion_bottle_empty", "purple", None),
}

# ===========================================================================


def load_json(path):
    """json.load that tolerates // comments and a BOM (Mojang's files have both)."""
    txt = open(path, encoding="utf-8-sig").read()
    txt = re.sub(r"^\s*//.*$", "", txt, flags=re.M)
    return json.loads(txt)


def short(i):
    return i.split(":", 1)[1] if ":" in i else i


def main(src):
    data = json.load(open(os.path.join(src, "metadata/vanilladata_modules/mojang-items.json")))
    ALL = {short(i["name"]) for i in data["data_items"]}

    def excluded(n):
        return n in EXCLUDE_EXACT or bool(EXCLUDE_RE.search(n))

    ITEMS = sorted(n for n in ALL if not excluded(n))

    # ---- id normalisation (old data-value ids -> modern ids) -------------
    RENAME = {"reeds": "sugar_cane", "melon": "melon_slice", "emptymap": "empty_map",
              "chorus_fruit_popped": "popped_chorus_fruit", "chain": "iron_chain",
              "speckled_melon": "glistering_melon_slice", "fish": "cod", "cooked_fish": "cooked_cod",
              "clownfish": "tropical_fish", "scute": "turtle_scute", "netherstar": "nether_star",
              "turtle_shell_piece": "turtle_scute", "horsearmorleather": "leather_horse_armor",
              "horsearmoriron": "iron_horse_armor", "horsearmorgold": "golden_horse_armor",
              "horsearmordiamond": "diamond_horse_armor", "sealantern": "sea_lantern", "record_5": "music_disc_5",
              "carrotonastick": "carrot_on_a_stick", "muttoncooked": "cooked_mutton", "muttonraw": "mutton",
              "darkoak_sign": "dark_oak_sign", "sign": "oak_sign", "appleenchanted": "enchanted_golden_apple"}

    def norm(raw, dat=None):
        if raw is None:
            return None
        parts = raw.split(":")
        if len(parts) == 1:
            n = parts[0]
        else:
            n = parts[1]
            if len(parts) >= 3 and dat is None:
                try:
                    dat = int(parts[2])
                except ValueError:
                    if n == "potion_type":
                        return "potion"
        if n == "potion_type":
            return "potion"
        n = n.lower() if n.lower() in RENAME else n
        if n == "skull":
            return {0: "skeleton_skull", 1: "wither_skeleton_skull", 2: "zombie_head", 3: "player_head",
                    4: "creeper_head", 5: "dragon_head", 6: "piglin_head"}.get(dat or 0)
        if n == "wood" and n not in ALL:
            w = WOODS6[((dat or 0) & 7) % 6]
            return ("stripped_" if (dat or 0) & 8 else "") + f"{w}_wood"
        if n == "banner_pattern" and n not in ALL:
            return ["creeper", "skull", "flower", "mojang", "field_masoned", "bordure_indented"][(dat or 0) % 6] + "_banner_pattern"
        if n == "dye":
            return DYE_DATA.get(dat if dat is not None else 0)
        if n == "bucket" and dat:
            return {1: "milk_bucket", 2: "cod_bucket", 3: "salmon_bucket", 4: "tropical_fish_bucket",
                    5: "pufferfish_bucket", 8: "water_bucket", 10: "lava_bucket", 11: "powder_snow_bucket",
                    12: "axolotl_bucket", 13: "tadpole_bucket"}.get(dat)
        if n == "coal" and dat == 1:
            return "charcoal"
        for legacy, suffix in (("wool", "wool"), ("carpet", "carpet"), ("concrete", "concrete"),
                               ("concrete_powder", "concrete_powder"), ("stained_glass", "stained_glass"),
                               ("stained_glass_pane", "stained_glass_pane"), ("shulker_box", "shulker_box"),
                               ("stained_hardened_clay", "terracotta")):
            if n == legacy and (dat is not None or legacy not in ALL):
                return f"{COLORS[(dat or 0) % 16]}_{suffix}"
        if n in ("planks", "wooden_slab", "boat", "chest_boat") and n not in ALL:
            w = WOODS6[(dat or 0) % 6]
            return {"planks": f"{w}_planks", "wooden_slab": f"{w}_slab", "boat": f"{w}_boat",
                    "chest_boat": f"{w}_chest_boat"}[n]
        if n == "log" and n not in ALL:
            return f"{WOODS6[(dat or 0) % 4]}_log"
        if n == "log2" and n not in ALL:
            return f"{WOODS6[4 + (dat or 0) % 2]}_log"
        n = RENAME.get(n, n)
        return n if n in ALL else None

    # ---- tags --------------------------------------------------------------
    WOOD_SLABS = [n for n in ALL if n.endswith("_slab") and any(n.startswith(w) for w in
                  WOODS6 + ["cherry", "mangrove", "bamboo", "crimson", "warped", "pale_oak", "poplar"])
                  and "mosaic" not in n]
    LOGS = [n for n in ALL if re.search(r"(_log|_wood|_stem|_hyphae)$", n) and "petrified" not in n]
    TAGS = {
        "planks": [n for n in ALL if n.endswith("_planks")],
        "logs": LOGS,
        "logs_that_burn": [n for n in LOGS if "crimson" not in n and "warped" not in n],
        "wool": [f"{c}_wool" for c in COLORS],
        "wooden_slabs": WOOD_SLABS,
        "coals": ["coal", "charcoal"],
        "stone_tool_materials": ["cobblestone", "blackstone", "cobbled_deepslate"],
        "stone_crafting_materials": ["cobblestone", "blackstone", "cobbled_deepslate"],
        "soul_fire_base_blocks": ["soul_sand", "soul_soil"],
        "metal_nuggets": ["iron_nugget", "gold_nugget", "copper_nugget"],
        "egg": ["egg", "blue_egg", "brown_egg"],
        "mushrooms_for_stew": ["red_mushroom", "brown_mushroom"],
    }
    TAGS = {k: [m for m in v if m in ALL] for k, v in TAGS.items()}

    def ingredient(o):
        """-> list of alternative item ids (empty list = unusable)"""
        if isinstance(o, list):
            out = []
            for x in o:
                out += ingredient(x)
            return out
        if isinstance(o, str):
            n = norm(o)
            return [n] if n else []
        if isinstance(o, dict):
            if "tag" in o:
                return TAGS.get(short(o["tag"]), [])
            n = norm(o.get("item"), o.get("data"))
            return [n] if n else []
        return []

    # recipe = (inputs: [(alternatives, count)], outputs: [(id, count)], kind)
    recipes = []
    skipped = 0
    for f in glob.glob(os.path.join(src, "behavior_pack/recipes/*.json")):
        r = load_json(f)
        for kind, v in r.items():
            if not kind.startswith("minecraft:recipe"):
                continue
            ins, outs = [], []
            if kind == "minecraft:recipe_shaped":
                counts = defaultdict(int)
                for row in v["pattern"]:
                    for ch in row:
                        if ch != " ":
                            counts[ch] += 1
                for ch, c in counts.items():
                    ins.append((ingredient(v["key"][ch]), c))
            elif kind == "minecraft:recipe_shapeless":
                for ing in v["ingredients"]:
                    c = ing.get("count", 1) if isinstance(ing, dict) else 1
                    ins.append((ingredient(ing), c))
            elif kind == "minecraft:recipe_furnace":
                ins.append((ingredient(v["input"]), 1))
            elif kind == "minecraft:recipe_smithing_transform":
                for k in ("template", "base", "addition"):
                    ins.append((ingredient(v[k]), 1))
            elif kind in ("minecraft:recipe_brewing_mix", "minecraft:recipe_brewing_container"):
                ins.append((ingredient(v["input"]), 1))
                ins.append((ingredient(v["reagent"]), 1))
            else:
                continue
            res = v.get("result", v.get("output"))
            for x in (res if isinstance(res, list) else [res]):
                if isinstance(x, dict):
                    n, c = norm(x.get("item"), x.get("data")), x.get("count", 1)
                else:
                    n, c = norm(x), 1
                if n:
                    outs.append((n, c))
            if not outs or any(not alts for alts, _ in ins):
                skipped += 1
                if os.environ.get("DEBUG"):
                    print("SKIP", os.path.basename(f), json.dumps(v.get("result", v.get("output")))[:80],
                          [json.dumps(v.get("key", v.get("ingredients", v.get("input"))))[:200]])
                continue
            # filled containers come back after crafting
            if kind in ("minecraft:recipe_shaped", "minecraft:recipe_shapeless"):
                for alts, c in ins:
                    if len(alts) == 1 and alts[0] in CONTAINER and not any(
                            o == CONTAINER[alts[0]] for o, _ in outs):
                        outs.append((CONTAINER[alts[0]], c))
            recipes.append((ins, outs, kind))

    # ---- manual conversions that aren't recipes ------------------------
    def edge(a, b, n=1, extra=()):
        if a in ALL and b in ALL:
            recipes.append(([([a], 1)] + [([e], 1) for e in extra], [(b, n)], "manual"))

    for n in ALL:
        if n.startswith("stripped_"):
            base = n[len("stripped_"):]
            for cand in (base, base.replace("_wood", "_log")):
                edge(cand, n)
    for c in COLORS:
        edge(f"{c}_concrete_powder", f"{c}_concrete")
    for n in ALL:  # copper ageing / scraping
        for a, b in (("", "exposed_"), ("exposed_", "weathered_"), ("weathered_", "oxidized_")):
            if n.startswith(b):
                rest = n[len(b):]
                src_name = (a + rest) if (a + rest) in ALL else ("copper_block" if rest == "copper" and not a else a + rest)
                edge(src_name, n)
                edge(n, src_name)
    for b in ("water_bucket", "lava_bucket", "milk_bucket", "powder_snow_bucket"):
        edge("bucket", b)
    for fish in ("cod", "salmon", "pufferfish", "tropical_fish"):
        edge("water_bucket", f"{fish}_bucket", extra=(fish,))
    for b in ("axolotl_bucket", "tadpole_bucket", "sulfur_cube_bucket"):
        edge("water_bucket", b)
    for b in ("potion", "honey_bottle", "dragon_breath"):
        edge("glass_bottle", b)
    # emptying / drinking / eating gives the container back
    for full, empty in CONTAINER.items():
        edge(full, empty)
    for b in ("cod_bucket", "salmon_bucket", "pufferfish_bucket", "tropical_fish_bucket", "axolotl_bucket",
              "tadpole_bucket", "sulfur_cube_bucket"):
        edge(b, "bucket")
    for stew in ("mushroom_stew", "beetroot_soup", "rabbit_stew", "suspicious_stew"):
        edge(stew, "bowl")
    for p in ("splash_potion", "lingering_potion"):
        edge(p, "glass_bottle")
    for c in COLORS:  # washing dyed things in a cauldron
        edge(f"{c}_shulker_box", "undyed_shulker_box")
    # recipes missing from Mojang's sample files
    def craft(ins, out, n=1):
        if out in ALL and all(i in ALL for i, _ in ins):
            recipes.append(([([i], c) for i, c in ins], [(out, n)], "manual"))
    for w in WOODS6 + ["cherry", "mangrove", "bamboo", "crimson", "warped", "pale_oak", "poplar"]:
        pl = f"{w}_planks"
        btn = "wooden_button" if w == "oak" else f"{w}_button"
        plate = "wooden_pressure_plate" if w == "oak" else f"{w}_pressure_plate"
        trap = "trapdoor" if w == "oak" else f"{w}_trapdoor"
        craft([(pl, 1)], btn)
        craft([(pl, 2)], plate)
        craft([(pl, 6)], trap, 2)
        craft([(pl, 6), ("stick", 1)], f"{w}_sign", 3)
        craft([(f"{w}_boat", 1), ("chest", 1)], f"{w}_chest_boat")
    craft([("bamboo_raft", 1), ("chest", 1)], "bamboo_chest_raft")
    for c in COLORS:
        craft([("bundle", 1), (f"{c}_dye", 1)], f"{c}_bundle")
        craft([("leather", 3), ("glass", 2), (f"{c}_wool", 1)], f"{c}_harness")
        craft([("undyed_shulker_box", 1), (f"{c}_dye", 1)], f"{c}_shulker_box")
        craft([("hardened_clay", 8), (f"{c}_dye", 1)], f"{c}_terracotta", 8)
        glazed = "silver_glazed_terracotta" if c == "light_gray" else f"{c}_glazed_terracotta"
        craft([(f"{c}_terracotta", 1)], glazed)
    craft([("clay", 1)], "hardened_clay")
    craft([("turtle_scute", 5)], "turtle_helmet")
    craft([("nether_star", 1), ("glass", 5), ("obsidian", 3)], "beacon")
    craft([("brick", 4)], "decorated_pot")
    craft([("paper", 1), ("gunpowder", 1)], "firework_rocket", 3)
    craft([("gunpowder", 1), ("white_dye", 1)], "firework_star")
    craft([("melon_slice", 1), ("gold_nugget", 8)], "glistering_melon_slice")
    craft([("resin_clump", 9)], "resin_block")
    craft([("resin_clump", 4)], "resin_bricks")
    craft([("anvil", 1)], "chipped_anvil")
    craft([("chipped_anvil", 1)], "damaged_anvil")
    craft([("pumpkin", 1)], "carved_pumpkin")
    craft([("netherrack", 1)], "netherbrick")
    craft([("fishing_rod", 1), ("carrot", 1)], "carrot_on_a_stick")
    craft([("white_wool", 3), ("oak_planks", 3)], "bed")
    edge("dirt", "mud", extra=("potion",))
    edge("dirt", "grass_block")
    edge("dirt", "coarse_dirt")
    for b, drops in DROPS.items():
        if b in ALL:
            recipes.append(([([b], 1)], [(d, c) for d, c in drops if d in ALL and c > 0], "drop"))

    # ---- values ----------------------------------------------------------
    def base_value(n):
        if n in BASE:
            return BASE[n]
        for k, v in BASE.items():
            if (k.startswith("_") and n.endswith(k)) or (k.endswith("_") and n.startswith(k)):
                return v
        return None

    INF = float("inf")
    V = {n: (base_value(n) if base_value(n) is not None else INF) for n in ALL}

    def consume(i):  # value used up when an ingredient is crafted (container comes back)
        return max(0.0, V[i] - V.get(CONTAINER[i], 0)) if i in CONTAINER else V[i]

    for _ in range(200):
        changed = False
        for ins, outs, kind in recipes:
            if kind == "drop":
                continue
            main_out, n_out = outs[0]
            cost = 0.0
            for alts, c in ins:
                best = min(consume(a) if kind in ("minecraft:recipe_shaped", "minecraft:recipe_shapeless") else V[a]
                           for a in alts)
                cost += best * c
            if cost == INF:
                continue
            per = cost / n_out
            if per < V[main_out] - 1e-9:
                V[main_out] = per
                changed = True
        if not changed:
            break

    # ores etc must be worth at least what they drop
    for b, drops in DROPS.items():
        if b in V:
            worth = sum(V.get(d, 0) * c for d, c in drops if V.get(d, INF) < INF)
            if V[b] == INF or V[b] < worth:
                V[b] = worth

    # ---- integer prices ----------------------------------------------------
    missing = [n for n in ITEMS if V[n] == INF]
    buy, sell = {}, {}
    for n in ITEMS:
        if V[n] == INF:
            continue
        buy[n] = max(1, math.ceil(V[n] - 1e-9))
        sell[n] = int(math.floor(buy[n] * SELL_RATIO))

    # ---- ANTI-PROFIT CHECK -------------------------------------------------
    # C[x] = the cheapest a player could ever get x for: buy it, or buy other
    # items and craft/smelt/convert them (through any number of steps).
    # Every conversion satisfies  sum(C of outputs) <= sum(C of inputs), so
    # nothing a player does can turn bought items into more than they paid.
    # Selling x never pays more than C[x]  ->  buy + craft + sell is never profitable.
    C = dict(buy)
    for rounds in range(1, 500):
        changed = False
        for ins, outs, kind in recipes:
            cost = 0.0
            for alts, c in ins:
                opts = [C[x] for x in alts if x in C]
                if not opts:
                    cost = None
                    break
                cost += min(opts) * c
            if cost is None:
                continue
            outs_c = [(o, c) for o, c in outs if o in C]
            total = sum(C[o] * c for o, c in outs_c)
            for o, c in outs_c:
                others = total - C[o] * c
                v = max(0.0, (cost - others) / c)
                if v < C[o] - 1e-9:
                    total -= (C[o] - v) * c
                    C[o] = v
                    changed = True
        if not changed:
            break
    for n in sell:
        sell[n] = min(sell[n], int(math.floor(C[n] + 1e-9)))

    # verify: every conversion and every item obeys the rules
    for ins, outs, kind in recipes:
        cost = 0.0
        for alts, c in ins:
            opts = [C[x] for x in alts if x in C]
            if not opts:
                cost = None
                break
            cost += min(opts) * c
        if cost is not None:
            assert sum(C[o] * c for o, c in outs if o in C) <= cost + 1e-6, (ins, outs)
    assert all(0 <= sell[n] <= C[n] + 1e-9 and C[n] <= buy[n] for n in buy)
    lowered = sorted((n for n in sell if sell[n] < int(buy[n] * SELL_RATIO)), key=lambda n: -buy[n])

    # ---- icons ---------------------------------------------------------------
    rp = os.path.join(src, "resource_pack")
    item_tex = load_json(os.path.join(rp, "textures/item_texture.json"))["texture_data"]
    terrain = load_json(os.path.join(rp, "textures/terrain_texture.json"))["texture_data"]
    blocks = load_json(os.path.join(rp, "blocks.json"))

    def tex_path(entry):
        t = entry.get("textures") if isinstance(entry, dict) else entry
        if isinstance(t, list):
            t = t[0]
        if isinstance(t, dict):
            t = t.get("path")
        return t if isinstance(t, str) else None

    TEX = set()

    def collect(o):
        if isinstance(o, str) and o.startswith("textures/"):
            TEX.add(o)
        elif isinstance(o, dict):
            for v in o.values():
                collect(v)
        elif isinstance(o, list):
            for v in o:
                collect(v)
    collect(item_tex)
    collect(terrain)
    ICON_NAME = {
        "cooked_cod": "fish_cooked", "cod": "fish_raw", "beef": "beef_raw", "chicken": "chicken_raw",
        "mutton": "mutton_raw", "porkchop": "porkchop_raw", "tropical_fish": "fish_clownfish_raw",
        "melon_slice": "melon", "sugar_cane": "reeds", "cocoa_beans": "dye_powder_brown",
        "bone_meal": "dye_powder_white", "ink_sac": "dye_powder_black", "lapis_lazuli": "dye_powder_blue",
        "redstone": "redstone_dust", "bow": "bow_standby", "crossbow": "crossbow_standby",
        "compass": "compass_item", "clock": "clock_item", "totem_of_undying": "totem",
        "potion": "potion_bottle_drinkable", "splash_potion": "potion_bottle_splash",
        "lingering_potion": "potion_bottle_lingering", "glass_bottle": "potion_bottle_empty",
        "fermented_spider_eye": "spider_eye_fermented", "glistering_melon_slice": "melon_speckled",
        "book": "book_normal", "firework_rocket": "fireworks", "firework_star": "fireworks_charge",
        "fire_charge": "fireball", "minecart": "minecart_normal", "enchanted_golden_apple": "apple_golden",
        "turtle_scute": "turtle_shell_piece", "popped_chorus_fruit": "chorus_fruit_popped",
        "iron_chain": "chain", "glow_ink_sac": "dye_powder_glow", "banner": "banner_base",
        "water_bucket": "bucket_water", "lava_bucket": "bucket_lava", "milk_bucket": "bucket_milk",
        "powder_snow_bucket": "bucket_powder_snow", "cod_bucket": "bucket_cod", "salmon_bucket": "bucket_salmon",
        "pufferfish_bucket": "bucket_pufferfish", "tropical_fish_bucket": "bucket_tropical",
        "axolotl_bucket": "bucket_axolotl", "tadpole_bucket": "bucket_tadpole",
        "oak_sign": "sign", "dark_oak_boat": "boat_darkoak", "dark_oak_sign": "sign_darkoak", "grass_block": "../blocks/grass_side_carried", "sea_lantern": "../blocks/sea_lantern",
        "bamboo_raft": "bamboo_raft", "bamboo_chest_raft": "bamboo_chest_raft",
    }

    def guess(n):
        names = [ICON_NAME.get(n, n)]
        m = re.match(r"^(wooden|golden|stone|iron|diamond|netherite|copper|leather|chainmail)_(\w+)$", n)
        if m:
            mat = {"wooden": "wood", "golden": "gold"}.get(m.group(1), m.group(1))
            names += [f"{mat}_{m.group(2)}", f"{m.group(2)}_{mat}"]
        m = re.match(r"^(\w+?)_(chest_boat|boat|sign)$", n)
        if m:
            names += [f"{m.group(2)}_{m.group(1)}", f"{m.group(1)}_{m.group(2)}"]
        m = re.match(r"^(\w+)_dye$", n)
        if m:
            c = "silver" if m.group(1) == "light_gray" else m.group(1)
            names += [f"dye_powder_{c}_new", f"dye_powder_{c}"]
        if n.startswith("music_disc_"):
            names.append("record_" + n[len("music_disc_"):])
        for nm in names:
            for p in (f"textures/items/{nm}", f"textures/blocks/{nm}"):
                p = os.path.normpath(p).replace(os.sep, "/")
                if p in TEX:
                    return p
        return None

    def icon(n):
        g = guess(n)
        if g and n in ICON_NAME:
            return g
        cands = [n, n.replace("_", ""), re.sub(r"^(.*)_(\w+)$", r"\2_\1", n)]
        for c in cands:
            if c in item_tex:
                p = tex_path(item_tex[c])
                if p:
                    return p
        b = blocks.get(n)
        if b and "textures" in b:
            t = b["textures"]
            if isinstance(t, dict):
                t = t.get("side") or t.get("north") or t.get("up") or next(iter(t.values()))
            if t in terrain:
                p = tex_path(terrain[t])
                if p:
                    return p
        return guess(n)

    # ---- categories ------------------------------------------------------
    rules = [(c, re.compile(r)) for c, r in CATEGORY_RULES]

    def category(n):
        for c, r in rules:
            if r.search(n):
                return c
        return "decor"

    def nice(n):
        return " ".join(w.capitalize() for w in n.split("_"))

    rows = []
    no_icon = 0
    for n in ITEMS:
        if n not in buy:
            continue
        ic = icon(n)
        if not ic:
            no_icon += 1
        rows.append([n, nice(n), ic or "", buy[n], sell[n], category(n)])

    cats = {c: [] for c in CATEGORY_INFO}
    for r in rows:
        cats[r[5]].append(r)

    with open(OUT, "w") as f:
        f.write("// AUTO-GENERATED by tools/generate_prices.py - edit that script (or PRICE_OVERRIDES\n")
        f.write("// in config.js) instead of this file.\n")
        f.write("// [id, display name, icon, buy price, sell price]\n")
        f.write("export const CATEGORIES = " + json.dumps(
            [{"id": c, "name": i[0], "desc": i[1], "icon": i[2], "theme": i[3], "group": i[4]}
             for c, i in CATEGORY_INFO.items()],
            indent=1) + ";\n\n")
        f.write("export const ITEMS = {\n")
        for c in CATEGORY_INFO:
            f.write(f"  {c}: [\n")
            for r in sorted(cats[c], key=lambda r: r[1]):
                f.write("    " + json.dumps(["minecraft:" + r[0], r[1], r[2], r[3], r[4]]) + ",\n")
            f.write("  ],\n")
        f.write("};\n")

    print(f"recipes used: {len(recipes)}  (skipped {skipped})")
    print(f"priced items: {len(rows)}   no icon: {no_icon}   cheapest-cost passes: {rounds}")
    print(f"sell price lowered by the anti-profit check ({len(lowered)}):",
          ", ".join(f"{n} {sell[n]}/{buy[n]}" for n in lowered[:60]))
    print("by category:", {c: len(v) for c, v in cats.items()})
    if missing:
        print(f"NO PRICE ({len(missing)}):", " ".join(missing))
    return V, buy, sell, recipes


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
