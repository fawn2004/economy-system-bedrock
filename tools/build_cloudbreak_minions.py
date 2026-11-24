"""Builds Cloudbreak's minions into packs/Cloudbreak_BP and packs/Cloudbreak_RP.

  python3 tools/build_cloudbreak_minions.py

Writes: the 10 chosen minion models + skins, the minion and display-block
entities, scripts/eco/minion_types.js, and the "Enchanted <item>" loot items.
Prices, upgrade multipliers, upgrade costs and item values follow the Skyblock
Economy minion at the same position (so every minion earns about the same).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from cb_models import build  # noqa: E402
import cb_minion_designs as D  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
BP = os.path.join(ROOT, "packs", "Cloudbreak_BP")
RP = os.path.join(ROOT, "packs", "Cloudbreak_RP")
B, I = "textures/blocks/", "textures/items/"
X, C = "cross", "cube"

# Per price position: (price, upgradeMultiplier, tier upgrade costs, tier values)
LADDER = [
    (25000, 1, [0, 50000, 150000, 350000, 600000, 1000000, 2500000, 5000000], [10, 25, 50, 90, 150, 250, 400, 700]),
    (150000, 3, [0, 300000, 600000, 1200000, 2000000, 3500000, 6000000, 10000000], [1200, 1500, 1900, 2400, 3000, 3800, 4800, 6000]),
    (2000000, 8, [0, 3000000, 5000000, 8000000, 12000000, 18000000, 26000000, 40000000], [7000, 8500, 10000, 12500, 15000, 18000, 22000, 27000]),
    (10000000, 20, [0, 12000000, 18000000, 26000000, 38000000, 55000000, 80000000, 120000000], [30000, 36000, 43000, 52000, 62000, 75000, 90000, 110000]),
    (50000000, 50, [0, 60000000, 90000000, 130000000, 190000000, 270000000, 380000000, 550000000], [125000, 150000, 180000, 215000, 260000, 310000, 375000, 450000]),
]

# (id, name, kind, price position, design function, tiers)
# tier = (name, loot id, display texture, icon texture, shape)
ROSTER = [
    ("cloud", "Cloud Miner", "mining", 0, D.cloud_b, [
        ("Snow", "snow", B + "snow", B + "snow", C),
        ("Clay", "clay", B + "clay", B + "clay", C),
        ("Calcite", "calcite", B + "calcite", B + "calcite", C),
        ("Diorite", "diorite", B + "stone_diorite", B + "stone_diorite", C),
        ("Packed Ice", "packed_ice", B + "ice_packed", B + "ice_packed", C),
        ("Blue Ice", "blue_ice", B + "blue_ice", B + "blue_ice", C),
        ("Quartz", "quartz_block", B + "quartz_block_side", B + "quartz_block_side", C),
        ("Pearlescent Froglight", "pearlescent_froglight", B + "pearlescent_froglight_side", B + "pearlescent_froglight_side", C),
    ]),
    ("storm", "Storm Miner", "mining", 1, D.storm_a, [
        ("Tuff", "tuff", B + "tuff", B + "tuff", C),
        ("Andesite", "andesite", B + "stone_andesite", B + "stone_andesite", C),
        ("Cobbled Deepslate", "cobbled_deepslate", B + "deepslate/cobbled_deepslate", B + "deepslate/cobbled_deepslate", C),
        ("Raw Copper Block", "raw_copper_block", B + "raw_copper_block", B + "raw_copper_block", C),
        ("Copper Block", "copper_block", B + "copper_block", B + "copper_block", C),
        ("Weathered Copper", "weathered_copper", B + "weathered_copper", B + "weathered_copper", C),
        ("Oxidized Copper", "oxidized_copper", B + "oxidized_copper", B + "oxidized_copper", C),
        ("Lodestone", "lodestone", B + "lodestone_side", B + "lodestone_side", C),
    ]),
    ("sun", "Sunforge", "mining", 2, D.sun_b, [
        ("Terracotta", "hardened_clay", B + "hardened_clay", B + "hardened_clay", C),
        ("Red Sandstone", "red_sandstone", B + "red_sandstone_normal", B + "red_sandstone_normal", C),
        ("Magma", "magma", B + "magma", B + "magma", C),
        ("Glowstone", "glowstone", B + "glowstone", B + "glowstone", C),
        ("Shroomlight", "shroomlight", B + "shroomlight", B + "shroomlight", C),
        ("Ochre Froglight", "ochre_froglight", B + "ochre_froglight_side", B + "ochre_froglight_side", C),
        ("Raw Gold Block", "raw_gold_block", B + "raw_gold_block", B + "raw_gold_block", C),
        ("Gilded Blackstone", "gilded_blackstone", B + "gilded_blackstone", B + "gilded_blackstone", C),
    ]),
    ("void", "Void Miner", "mining", 3, D.void_b, [
        ("End Stone", "end_stone", B + "end_stone", B + "end_stone", C),
        ("Purpur", "purpur_block", B + "purpur_block", B + "purpur_block", C),
        ("Obsidian", "obsidian", B + "obsidian", B + "obsidian", C),
        ("Crying Obsidian", "crying_obsidian", B + "crying_obsidian", B + "crying_obsidian", C),
        ("Amethyst", "amethyst_block", B + "amethyst_block", B + "amethyst_block", C),
        ("Sculk", "sculk", B + "sculk", B + "sculk", C),
        ("Verdant Froglight", "verdant_froglight", B + "verdant_froglight_side", B + "verdant_froglight_side", C),
        ("Reinforced Deepslate", "reinforced_deepslate", B + "reinforced_deepslate_top", B + "reinforced_deepslate_top", C),
    ]),
    ("star", "Starfall", "mining", 4, D.star_a, [
        ("Prismarine", "prismarine", B + "prismarine_rough", B + "prismarine_rough", C),
        ("Dark Prismarine", "dark_prismarine", B + "prismarine_dark", B + "prismarine_dark", C),
        ("Sea Lantern", "sea_lantern", B + "sea_lantern", B + "sea_lantern", C),
        ("Lapis Block", "lapis_block", B + "lapis_block", B + "lapis_block", C),
        ("Emerald Block", "emerald_block", B + "emerald_block", B + "emerald_block", C),
        ("Diamond Block", "diamond_block", B + "diamond_block", B + "diamond_block", C),
        ("Ancient Debris", "ancient_debris", B + "ancient_debris_side", B + "ancient_debris_side", C),
        ("Netherite Block", "netherite_block", B + "netherite_block", B + "netherite_block", C),
    ]),
    ("meadow", "Meadow Sprite", "farming", 0, D.meadow_b, [
        ("Wheat", "wheat", B + "wheat_stage_7", I + "wheat", X),
        ("Carrot", "carrot", B + "carrots_stage_3", I + "carrot", X),
        ("Potato", "potato", B + "potatoes_stage_3", I + "potato", X),
        ("Beetroot", "beetroot", B + "beetroots_stage_3", I + "beetroot", X),
        ("Sugar Cane", "sugar_cane", B + "reeds", I + "reeds", X),
        ("Cactus", "cactus", B + "cactus_side", B + "cactus_side", C),
        ("Melon", "melon_slice", B + "melon_side", I + "melon", C),
        ("Pumpkin", "pumpkin", B + "pumpkin_side", B + "pumpkin_side", C),
    ]),
    ("ember", "Ember Grower", "farming", 1, D.ember_a, [
        ("Nether Wart", "nether_wart", B + "nether_wart_stage_2", I + "nether_wart", X),
        ("Crimson Fungus", "crimson_fungus", B + "crimson_fungus", B + "crimson_fungus", X),
        ("Warped Fungus", "warped_fungus", B + "warped_fungus", B + "warped_fungus", X),
        ("Crimson Roots", "crimson_roots", B + "crimson_roots", B + "crimson_roots", X),
        ("Warped Roots", "warped_roots", B + "warped_roots", B + "warped_roots", X),
        ("Nether Sprouts", "nether_sprouts", B + "nether_sprouts", B + "nether_sprouts", X),
        ("Weeping Vines", "weeping_vines", B + "weeping_vines_base", B + "weeping_vines_base", X),
        ("Twisting Vines", "twisting_vines", B + "twisting_vines_base", B + "twisting_vines_base", X),
    ]),
    ("canopy", "Canopy Keeper", "farming", 2, D.canopy_b, [
        ("Sweet Berries", "sweet_berries", B + "sweet_berry_bush_stage3", I + "sweet_berries", X),
        ("Glow Berries", "glow_berries", B + "cave_vines_head_berries", I + "glow_berries", X),
        ("Cocoa Beans", "cocoa_beans", B + "cocoa_stage_2", I + "dye_powder_brown", X),
        ("Bamboo", "bamboo", B + "bamboo_block", B + "bamboo_block", C),
        ("Kelp", "kelp", B + "kelp_a", B + "kelp_a", X),
        ("Sea Pickle", "sea_pickle", B + "sea_pickle", I + "sea_pickle", X),
        ("Lily Pad", "waterlily", B + "waterlily", B + "carried_waterlily", X),
        ("Big Dripleaf", "big_dripleaf", B + "big_dripleaf_top", B + "big_dripleaf_top", X),
    ]),
    ("bloom", "Bloomwarden", "farming", 3, D.bloom_a, [
        ("Pink Petals", "pink_petals", B + "pink_petals", B + "pink_petals", X),
        ("Azalea", "azalea", B + "azalea_side", B + "azalea_side", C),
        ("Flowering Azalea", "flowering_azalea", B + "flowering_azalea_side", B + "flowering_azalea_side", C),
        ("Spore Blossom", "spore_blossom", B + "spore_blossom", B + "spore_blossom", X),
        ("Chorus Flower", "chorus_flower", B + "chorus_flower", B + "chorus_flower", C),
        ("Torchflower", "torchflower", B + "torchflower", B + "torchflower", X),
        ("Pitcher Plant", "pitcher_plant", B + "pitcher_crop_side", B + "pitcher_crop_side", X),
        ("Wither Rose", "wither_rose", B + "flower_wither_rose", B + "flower_wither_rose", X),
    ]),
    ("king", "Orchard King", "farming", 4, D.king_b, [
        ("Apple", "apple", I + "apple", I + "apple", X),
        ("Golden Carrot", "golden_carrot", I + "carrot_golden", I + "carrot_golden", X),
        ("Glistering Melon", "glistering_melon_slice", I + "melon_speckled", I + "melon_speckled", X),
        ("Honeycomb", "honeycomb", I + "honeycomb", I + "honeycomb", X),
        ("Chorus Fruit", "chorus_fruit", I + "chorus_fruit", I + "chorus_fruit", X),
        ("Golden Apple", "golden_apple", I + "apple_golden", I + "apple_golden", X),
        ("Echo Shard", "echo_shard", I + "echo_shard", I + "echo_shard", X),
        ("Enchanted Golden Apple", "enchanted_golden_apple", I + "apple_golden", I + "apple_golden", X),
    ]),
]


def check_unique():
    seen = {}
    for mid, *_rest, tiers in ROSTER:
        for t in tiers:
            if t[1] in seen:
                raise SystemExit(f"{t[1]} used by both {seen[t[1]]} and {mid}")
            seen[t[1]] = mid


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)


def main():
    check_unique()
    display = []  # (texture, shape) per tier, in order
    types_js = []
    for si, (mid, name, kind, pos, design, tiers) in enumerate(ROSTER):
        price, mult, costs, values = LADDER[pos]
        out_tiers = []
        for ti, (tname, loot, disp, _icon, shape) in enumerate(tiers):
            out_tiers.append({"name": tname, "drop": ["minecraft:" + loot, 1], "cost": costs[ti], "value": values[ti], "display": len(display)})
            display.append((disp, shape))
        types_js.append({"id": mid, "name": name, "kind": kind, "price": price, "upgradeMultiplier": mult, "skin": si, "tiers": out_tiers})

    # --- scripts/eco/minion_types.js ---
    with open(os.path.join(BP, "scripts", "eco", "minion_types.js"), "w") as f:
        f.write("// AUTO-GENERATED by tools/build_cloudbreak_minions.py (ROSTER).\n")
        f.write("// Change prices/costs/values in-game (Admin > Settings > Minions) or there.\n")
        f.write("// value = sell price of one enchanted item; display = display-block texture index (don't edit)\n")
        f.write("export const MINION_TYPES = " + json.dumps(types_js, indent=2) + ";\n")

    # --- models + skins ---
    for old in os.listdir(os.path.join(RP, "textures", "entity")):
        if old.startswith("eco_minion"):
            os.remove(os.path.join(RP, "textures", "entity", old))
    for old in os.listdir(os.path.join(RP, "models", "entity")):
        if old.startswith("eco_minion.geo") or old.startswith("cb_minion_"):
            os.remove(os.path.join(RP, "models", "entity", old))
    geos = []
    for mid, _name, _kind, _pos, design, _t in ROSTER:
        model = design()
        model.ident = f"geometry.cb_minion_{mid}"
        geo, tex = build(model)
        write(os.path.join(RP, "models", "entity", f"cb_minion_{mid}.geo.json"), geo)
        tex.save(os.path.join(RP, "textures", "entity", f"cb_minion_{mid}.png"))
        geos.append(model.ident)

    ns = len(ROSTER)
    write(os.path.join(RP, "entity", "eco_minion.entity.json"), {
        "format_version": "1.10.0",
        "minecraft:client_entity": {"description": {
            "identifier": "eco:minion",
            "materials": {"default": "entity_alphatest"},
            "textures": {f"s{i}": f"textures/entity/cb_minion_{r[0]}" for i, r in enumerate(ROSTER)},
            "geometry": {f"g{i}": g for i, g in enumerate(geos)},
            "animations": {"mine": "animation.eco_minion.mine"},
            "scripts": {"animate": ["mine"]},
            "render_controllers": ["controller.render.eco_minion"],
        }},
    })
    write(os.path.join(RP, "entity", "eco_minion_block.entity.json"), {
        "format_version": "1.10.0",
        "minecraft:client_entity": {"description": {
            "identifier": "eco:minion_block",
            "materials": {"default": "entity_alphatest"},
            "textures": {f"t{i}": d[0] for i, d in enumerate(display)},
            "geometry": {"cube": "geometry.eco_minion_block", "cross": "geometry.eco_minion_crop"},
            "render_controllers": ["controller.render.eco_minion_block"],
        }},
    })
    write(os.path.join(RP, "render_controllers", "eco_minion_block.render_controllers.json"), {
        "format_version": "1.8.0",
        "render_controllers": {
            "controller.render.eco_minion_block": {
                "arrays": {
                    "textures": {"Array.tiers": [f"Texture.t{i}" for i in range(len(display))]},
                    "geometries": {"Array.shapes": [f"Geometry.{d[1]}" for d in display]},
                },
                "geometry": "Array.shapes[query.variant]",
                "materials": [{"*": "Material.default"}],
                "textures": ["Array.tiers[query.variant]"],
            },
            "controller.render.eco_minion": {
                "arrays": {
                    "textures": {"Array.skins": [f"Texture.s{i}" for i in range(ns)]},
                    "geometries": {"Array.geos": [f"Geometry.g{i}" for i in range(ns)]},
                },
                "geometry": "Array.geos[query.variant]",
                "materials": [{"*": "Material.default"}],
                "textures": ["Array.skins[query.variant]"],
            },
        },
    })

    # --- behaviour entities: variant per skin / per display tier ---
    for path, groups_prefix, count in ((os.path.join(BP, "entities", "eco_minion.json"), "skin", ns),
                                       (os.path.join(BP, "entities", "eco_minion_block.json"), "tier", len(display))):
        ent = json.load(open(path))
        e = ent["minecraft:entity"]
        e["component_groups"] = {f"eco:{groups_prefix}_{i}": {"minecraft:variant": {"value": i}} for i in range(count)}
        e["events"] = {f"eco:set_{groups_prefix}_{i}": {"add": {"component_groups": [f"eco:{groups_prefix}_{i}"]},
                                                         "remove": {"component_groups": [f"eco:{groups_prefix}_{j}" for j in range(count) if j != i]}}
                       for i in range(count)}
        write(path, ent)

    # --- loot items ---
    loot_dir = os.path.join(BP, "items", "minion_loot")
    for old in os.listdir(loot_dir):
        os.remove(os.path.join(loot_dir, old))
    tex_path = os.path.join(RP, "textures", "item_texture.json")
    data = json.load(open(tex_path))
    data["texture_data"] = {k: v for k, v in data["texture_data"].items() if not k.startswith("eco_mloot_")}
    lang = []
    for _mid, _n, _k, _p, _d, tiers in ROSTER:
        for (tname, loot, _disp, icon, _shape) in tiers:
            data["texture_data"][f"eco_mloot_{loot}"] = {"textures": icon}
            write(os.path.join(loot_dir, f"mloot_{loot}.json"), {
                "format_version": "1.21.60",
                "minecraft:item": {
                    "description": {"identifier": f"eco:mloot_{loot}", "menu_category": {"category": "items"}},
                    "components": {
                        "minecraft:icon": f"eco_mloot_{loot}",
                        "minecraft:display_name": {"value": f"§r§bEnchanted {tname}"},
                        "minecraft:max_stack_size": 64,
                        "minecraft:glint": True,
                    },
                },
            })
            lang.append(f"item.eco:mloot_{loot}=Enchanted {tname}\n")
    write(tex_path, data)
    for l in ("en_US", "en_GB"):
        p = os.path.join(RP, "texts", l + ".lang")
        kept = [ln for ln in open(p) if not re.match(r"item\.eco:(mloot_|enchanted_)", ln)]
        with open(p, "w") as f:
            f.writelines(kept + lang)
    print(f"Built {ns} minions, {len(display)} tiers, {len(display)} loot items.")


if __name__ == "__main__":
    main()
