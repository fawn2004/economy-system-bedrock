#!/usr/bin/env python3
"""
Pet companion entity (eco:pet): a small floating head that follows its owner.
Writes the textures (one per pet, 32x16 box UV for an 8x8x8 head), the model,
render controller, client entity and behaviour entity. Needs Pillow.
Pet order MUST match Object.keys(PET_TYPES) in scripts/pets.js.
"""
import json, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "packs")
RP = os.path.join(ROOT, "SkyblockEconomy_RP")
BP = os.path.join(ROOT, "SkyblockEconomy_BP")

PETS = ["wolf", "rabbit", "bee", "silverfish", "fox", "dolphin", "allay", "bat", "drake"]


def hexc(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def shade(c, f):
    return (int(c[0] * f), int(c[1] * f), int(c[2] * f), 255)


# Box UV for an 8x8x8 cube: top (8,0) bottom (16,0); sides on row y=8: right (0,8) front (8,8) left (16,8) back (24,8)
FACES = {"top": (8, 0), "bottom": (16, 0), "right": (0, 8), "front": (8, 8), "left": (16, 8), "back": (24, 8)}


def make(base, front_px, extra=None):
    img = Image.new("RGBA", (32, 16), (0, 0, 0, 0))
    px = img.load()
    for face, (ox, oy) in FACES.items():
        f = {"top": 1.08, "bottom": 0.7, "front": 1.0, "back": 0.85, "left": 0.9, "right": 0.9}[face]
        for y in range(8):
            for x in range(8):
                # light speckle so it doesn't look flat
                c = shade(base, f * (0.94 if (x * 3 + y * 5) % 7 == 0 else 1.0))
                px[ox + x, oy + y] = (min(255, c[0]), min(255, c[1]), min(255, c[2]), 255)
    fx, fy = FACES["front"]
    for (x, y), col in front_px.items():
        px[fx + x, fy + y] = hexc(col)
    if extra:
        extra(px)
    return img


def eyes(pos, col="#111111"):
    return {p: col for p in pos}


def designs():
    d = {}
    # wolf: grey, lighter muzzle, black nose, ears on top
    f = {**{(x, y): "#e8e8e8" for x in range(2, 6) for y in range(5, 8)}, **eyes([(1, 3), (6, 3)]), (3, 5): "#111111", (4, 5): "#111111", (3, 7): "#8a8a8a", (4, 7): "#8a8a8a"}
    def wolf_ears(px):
        for x in (8, 9, 14, 15):
            px[x, 0] = hexc("#8f8f8f"); px[x, 1] = hexc("#8f8f8f")
    d["wolf"] = make(hexc("#c9c9c9"), f, wolf_ears)
    # rabbit: brown, white muzzle, pink nose, long ears drawn on top
    f = {**{(x, y): "#f2efe6" for x in range(2, 6) for y in range(5, 8)}, **eyes([(1, 3), (6, 3)]), (3, 5): "#f7a1b5", (4, 5): "#f7a1b5"}
    def rabbit_ears(px):
        for y in range(0, 8):
            for x in (9, 10, 13, 14):
                px[x, y] = hexc("#7a5a3c")
            px[10, y] = hexc("#f7a1b5"); px[13, y] = hexc("#f7a1b5")
    d["rabbit"] = make(hexc("#9b7653"), f, rabbit_ears)
    # bee: yellow with black stripes, big eyes
    f = {**eyes([(1, 2), (2, 2), (1, 3), (2, 3), (5, 2), (6, 2), (5, 3), (6, 3)]), (3, 6): "#3a2a14", (4, 6): "#3a2a14"}
    def bee_stripes(px):
        for ox in (0, 16, 24):
            for y in range(8):
                for x in (2, 3, 6):
                    px[ox + x, 8 + y] = hexc("#2b2116")
        for x in (10, 13):
            px[x, 0] = hexc("#2b2116"); px[x, 1] = hexc("#2b2116")
    d["bee"] = make(hexc("#f2c22e"), f, bee_stripes)
    # silverfish: grey segmented, tiny black eyes
    f = {**eyes([(1, 4), (6, 4)]), **{(x, 2): "#6f6f6f" for x in range(8)}, **{(x, 6): "#6f6f6f" for x in range(8)}}
    d["silverfish"] = make(hexc("#9a9a9a"), f)
    # fox: orange, white lower face, black nose
    f = {**{(x, y): "#f5f0e6" for x in range(1, 7) for y in range(5, 8)}, **eyes([(1, 3), (6, 3)]), (3, 6): "#111111", (4, 6): "#111111"}
    def fox_ears(px):
        for x in (8, 9, 14, 15):
            px[x, 0] = hexc("#2b1a0e"); px[x, 1] = hexc("#c4651a")
    d["fox"] = make(hexc("#e37c21"), f, fox_ears)
    # dolphin: blue-grey, light belly, smile
    f = {**{(x, y): "#c9d6e3" for x in range(1, 7) for y in range(5, 8)}, **eyes([(1, 3), (6, 3)]), (2, 6): "#4a5f75", (3, 7): "#4a5f75", (4, 7): "#4a5f75", (5, 6): "#4a5f75"}
    d["dolphin"] = make(hexc("#6f8fae"), f)
    # allay: light blue, dark blue eyes, white shine
    f = {**eyes([(2, 3), (5, 3)], "#1e3f9e"), (2, 2): "#ffffff", (5, 2): "#ffffff", (3, 6): "#5aa9d6", (4, 6): "#5aa9d6"}
    d["allay"] = make(hexc("#86d8ff"), f)
    # bat: dark brown, red eyes, ears
    f = {**eyes([(1, 3), (6, 3)], "#e53935"), (3, 6): "#1a120e", (4, 6): "#1a120e"}
    def bat_ears(px):
        for x in (8, 9, 14, 15):
            for y in (0, 1, 2):
                px[x, y] = hexc("#22170f")
    d["bat"] = make(hexc("#4a3528"), f, bat_ears)
    # drake: purple, gold eyes, horns, spots
    f = {**eyes([(1, 3), (2, 3), (5, 3), (6, 3)], "#ffcc33"), (1, 2): "#ffffff", (6, 2): "#ffffff", (2, 6): "#2a1240", (5, 6): "#2a1240", (3, 7): "#2a1240", (4, 7): "#2a1240"}
    def horns(px):
        for x, y in ((8, 0), (9, 1), (15, 0), (14, 1)):
            px[x, y] = hexc("#e8d9a8")
        for ox in (0, 16):
            for x, y in ((2, 2), (5, 5), (3, 6)):
                px[ox + x, 8 + y] = hexc("#3b1a5c")
    d["drake"] = make(hexc("#6a32a0"), f, horns)
    return d


def main():
    os.makedirs(os.path.join(RP, "textures", "entity", "eco_pets"), exist_ok=True)
    for pet, img in designs().items():
        img.save(os.path.join(RP, "textures", "entity", "eco_pets", pet + ".png"))

    geo = {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.eco_pet", "texture_width": 32, "texture_height": 16,
                        "visible_bounds_width": 1, "visible_bounds_height": 1, "visible_bounds_offset": [0, 0.25, 0]},
        "bones": [{"name": "head", "pivot": [0, 4, 0], "cubes": [{"origin": [-4, 0, -4], "size": [8, 8, 8], "uv": [0, 0]}]}],
    }]}
    json.dump(geo, open(os.path.join(RP, "models", "entity", "eco_pet.geo.json"), "w"), indent=2)

    rc = {"format_version": "1.8.0", "render_controllers": {"controller.render.eco_pet": {
        "arrays": {"textures": {"Array.skins": [f"Texture.{p}" for p in PETS]}},
        "geometry": "Geometry.default", "materials": [{"*": "Material.default"}],
        "textures": ["Array.skins[query.variant]"],
    }}}
    json.dump(rc, open(os.path.join(RP, "render_controllers", "eco_pet.render_controllers.json"), "w"), indent=2)

    client = {"format_version": "1.10.0", "minecraft:client_entity": {"description": {
        "identifier": "eco:pet",
        "materials": {"default": "entity_alphatest"},
        "textures": {p: f"textures/entity/eco_pets/{p}" for p in PETS},
        "geometry": {"default": "geometry.eco_pet"},
        "render_controllers": ["controller.render.eco_pet"],
    }}}
    json.dump(client, open(os.path.join(RP, "entity", "eco_pet.entity.json"), "w"), indent=2)

    groups = {f"eco:pet_{i}": {"minecraft:variant": {"value": i}} for i in range(len(PETS))}
    events = {f"eco:set_pet_{i}": {"add": {"component_groups": [f"eco:pet_{i}"]},
                                   "remove": {"component_groups": [f"eco:pet_{j}" for j in range(len(PETS)) if j != i]}}
              for i in range(len(PETS))}
    beh = {"format_version": "1.21.0", "minecraft:entity": {
        "description": {"identifier": "eco:pet", "is_spawnable": False, "is_summonable": True},
        "component_groups": groups,
        "events": events,
        "components": {
            "minecraft:variant": {"value": 0},
            "minecraft:type_family": {"family": ["eco_pet", "inanimate"]},
            "minecraft:collision_box": {"width": 0.2, "height": 0.2},
            "minecraft:scale": {"value": 0.9},
            "minecraft:health": {"value": 1000, "max": 1000},
            "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
            "minecraft:physics": {"has_gravity": False, "has_collision": False},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:knockback_resistance": {"value": 1.0},
            "minecraft:fire_immune": {},
            "minecraft:nameable": {"always_show": False, "allow_name_tag_renaming": False},
        },
    }}
    json.dump(beh, open(os.path.join(BP, "entities", "eco_pet.json"), "w"), indent=2)
    print("pet entity written")


if __name__ == "__main__":
    main()
