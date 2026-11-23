"""Generates the crate entity (BP + RP), its model/animations/textures, the 5 crate
key items, the money pouch item and their icons. Run from the repo root:
    python3 tools/generate_crates.py
"""
import json, os
from PIL import Image, ImageDraw

BP = "packs/SkyblockEconomy_BP"
RP = "packs/SkyblockEconomy_RP"
TIERS = [
    # id, name, wood/body, trim, glow, colour code
    ("common", "Common", (120, 120, 128), (200, 200, 210), (235, 235, 235), "§f"),
    ("rare", "Rare", (40, 70, 160), (120, 190, 255), (90, 170, 255), "§9"),
    ("epic", "Epic", (90, 35, 140), (210, 120, 255), (200, 90, 255), "§5"),
    ("legendary", "Legendary", (150, 95, 20), (255, 215, 60), (255, 200, 40), "§6"),
    ("mythic", "Mythic", (150, 30, 110), (90, 255, 240), (255, 110, 220), "§d"),
]

def jdump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

# ---------------- BP entity ----------------
groups, events = {}, {}
for i, _ in enumerate(TIERS):
    groups[f"eco:crate_{i}"] = {"minecraft:variant": {"value": i}}
    events[f"eco:set_crate_{i}"] = {"add": {"component_groups": [f"eco:crate_{i}"]}, "remove": {"component_groups": [f"eco:crate_{j}" for j in range(len(TIERS)) if j != i]}}
groups["eco:crate_opened"] = {"minecraft:mark_variant": {"value": 1}}
events["eco:crate_open"] = {"add": {"component_groups": ["eco:crate_opened"]}}
events["eco:crate_close"] = {"remove": {"component_groups": ["eco:crate_opened"]}}
jdump(f"{BP}/entities/eco_crate.json", {
    "format_version": "1.21.0",
    "minecraft:entity": {
        "description": {"identifier": "eco:crate", "is_spawnable": False, "is_summonable": True},
        "component_groups": groups,
        "events": events,
        "components": {
            "minecraft:variant": {"value": 0},
            "minecraft:mark_variant": {"value": 0},
            "minecraft:type_family": {"family": ["eco_crate", "inanimate"]},
            "minecraft:collision_box": {"width": 1.0, "height": 1.0},
            "minecraft:health": {"value": 1000, "max": 1000},
            "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
            "minecraft:physics": {"has_gravity": False, "has_collision": True},
            "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
            "minecraft:knockback_resistance": {"value": 1.0},
            "minecraft:persistent": {},
            "minecraft:fire_immune": {},
            "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": False},
            "minecraft:interact": {"interactions": [{"on_interact": {"filters": {"all_of": [{"test": "is_family", "subject": "other", "value": "player"}]}}, "interact_text": "action.interact.eco_crate"}]},
        },
    },
})

# ---------------- RP entity ----------------
jdump(f"{RP}/entity/eco_crate.entity.json", {
    "format_version": "1.10.0",
    "minecraft:client_entity": {
        "description": {
            "identifier": "eco:crate",
            "materials": {"default": "entity_alphatest"},
            "textures": {f"t{i}": f"textures/entity/eco_crate_{t[0]}" for i, t in enumerate(TIERS)},
            "geometry": {"default": "geometry.eco_crate"},
            "animations": {
                "idle": "animation.eco_crate.idle",
                "open": "animation.eco_crate.open",
                "close": "animation.eco_crate.close",
                "lid": "controller.animation.eco_crate.lid",
            },
            "scripts": {"animate": ["idle", "lid"]},
            "render_controllers": ["controller.render.eco_crate"],
        }
    },
})
jdump(f"{RP}/render_controllers/eco_crate.render_controllers.json", {
    "format_version": "1.8.0",
    "render_controllers": {"controller.render.eco_crate": {
        "arrays": {"textures": {"Array.tiers": [f"Texture.t{i}" for i in range(len(TIERS))]}},
        "geometry": "Geometry.default",
        "materials": [{"*": "Material.default"}],
        "textures": ["Array.tiers[query.variant]"],
    }},
})
# model: base + lid (hinged at the back) + lock + floating gem
jdump(f"{RP}/models/entity/eco_crate.geo.json", {
    "format_version": "1.12.0",
    "minecraft:geometry": [{
        "description": {"identifier": "geometry.eco_crate", "texture_width": 64, "texture_height": 64, "visible_bounds_width": 3, "visible_bounds_height": 3, "visible_bounds_offset": [0, 1, 0]},
        "bones": [
            {"name": "root", "pivot": [0, 0, 0]},
            {"name": "base", "parent": "root", "pivot": [0, 0, 0], "cubes": [{"origin": [-7, 0, -7], "size": [14, 10, 14], "uv": [0, 19]}]},
            {"name": "lid", "parent": "root", "pivot": [0, 10, 7], "cubes": [{"origin": [-7, 10, -7], "size": [14, 5, 14], "uv": [0, 0]}]},
            {"name": "lock", "parent": "lid", "pivot": [0, 10, -7], "cubes": [{"origin": [-1, 7, -8], "size": [2, 4, 1], "uv": [56, 0]}]},
            {"name": "gem", "parent": "root", "pivot": [0, 21, 0], "cubes": [{"origin": [-2, 19, -2], "size": [4, 4, 4], "uv": [0, 44]}]},
        ],
    }],
})
jdump(f"{RP}/animations/eco_crate.animation.json", {
    "format_version": "1.8.0",
    "animations": {
        "animation.eco_crate.idle": {"loop": True, "bones": {
            "gem": {"position": [0, "math.sin(query.life_time * 120) * 1.2", 0], "rotation": [45, "query.life_time * 90", 45]},
        }},
        "animation.eco_crate.open": {"animation_length": 0.6, "loop": "hold_on_last_frame", "bones": {
            "lid": {"rotation": {"0.0": [0, 0, 0], "0.15": [6, 0, 0], "0.6": [-105, 0, 0]}},
            "root": {"position": {"0.0": [0, 0, 0], "0.08": [0.6, 0, 0], "0.16": [-0.6, 0, 0], "0.24": [0, 0, 0]}},
            "gem": {"position": {"0.0": [0, 0, 0], "0.6": [0, 6, 0]}, "rotation": [0, "query.life_time * 720", 0], "scale": {"0.0": [1, 1, 1], "0.6": [1.6, 1.6, 1.6]}},
        }},
        "animation.eco_crate.close": {"animation_length": 0.4, "bones": {
            "lid": {"rotation": {"0.0": [-105, 0, 0], "0.4": [0, 0, 0]}},
        }},
    },
})
jdump(f"{RP}/animations/eco_crate.animation_controllers.json", {
    "format_version": "1.10.0",
    "animation_controllers": {"controller.animation.eco_crate.lid": {
        "initial_state": "shut",
        "states": {
            "shut": {"transitions": [{"opened": "query.mark_variant == 1"}]},
            "opened": {"animations": ["open"], "transitions": [{"closing": "query.mark_variant == 0"}]},
            "closing": {"animations": ["close"], "transitions": [{"shut": "query.all_animations_finished"}, {"opened": "query.mark_variant == 1"}]},
        },
    }},
})

# ---------------- textures ----------------
def box_faces(u, v, w, h, d):
    """box UV rects: name -> (x0, y0, x1, y1)"""
    return {
        "top": (u + d, v, u + d + w, v + d), "bottom": (u + d + w, v, u + d + 2 * w, v + d),
        "east": (u, v + d, u + d, v + d + h), "north": (u + d, v + d, u + d + w, v + d + h),
        "west": (u + d + w, v + d, u + 2 * d + w, v + d + h), "south": (u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h),
    }

def shade(c, f):
    return tuple(max(0, min(255, int(x * f))) for x in c)

os.makedirs(f"{RP}/textures/entity", exist_ok=True)
for tid, name, body, trim, glow, _ in TIERS:
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    px = img.load()
    for (u, v, w, h, d) in [(0, 19, 14, 10, 14), (0, 0, 14, 5, 14)]:
        for face, (x0, y0, x1, y1) in box_faces(u, v, w, h, d).items():
            for x in range(x0, x1):
                for y in range(y0, y1):
                    # planks look: horizontal bands + noise
                    band = ((y - y0) // 3) % 2
                    n = ((x * 7 + y * 13) % 5) / 40
                    c = shade(body, 0.85 + 0.15 * band + n)
                    edge = x in (x0, x1 - 1) or y in (y0, y1 - 1)
                    if edge:
                        c = trim
                    if face in ("top",) and (x - x0) in (3, 10) and v == 0:
                        c = shade(trim, 0.85)  # metal straps on the lid
                    if face != "top" and face != "bottom" and (x - x0) in (2, (x1 - x0) - 3):
                        c = shade(trim, 0.8)  # corner bands
                    px[x, y] = c + (255,)
    # rainbow stripes on the mythic crate
    if tid == "mythic":
        rb = [(255, 80, 80), (255, 170, 60), (255, 240, 80), (90, 255, 120), (80, 200, 255), (170, 110, 255)]
        for x in range(14, 28):
            px[x, 33 + 4] = rb[(x // 2) % 6] + (255,)
            px[x, 33 + 5] = rb[(x // 2 + 1) % 6] + (255,)
    # lock
    for (x0, y0, x1, y1) in box_faces(56, 0, 2, 4, 1).values():
        for x in range(x0, x1):
            for y in range(y0, y1):
                px[x, y] = shade(trim, 1.1) + (255,)
    # gem
    for i, (x0, y0, x1, y1) in enumerate(box_faces(0, 44, 4, 4, 4).values()):
        for x in range(x0, x1):
            for y in range(y0, y1):
                c = shade(glow, 1.15 if (x + y) % 3 else 0.9)
                px[x, y] = c + (255,)
    img.save(f"{RP}/textures/entity/eco_crate_{tid}.png")

# key + pouch icons (16x16)
KEY = [
    "................",
    "....######......",
    "...#oooooo#.....",
    "..#oo####oo#....",
    "..#o#....#o#....",
    "..#o#....#o#....",
    "..#oo####oo#....",
    "...#oooooo#.....",
    "....##oo##......",
    "......oo........",
    "......oo##......",
    "......oooo#.....",
    "......oo##......",
    "......oo###.....",
    "......ooooo#....",
    "......#####.....",
]
POUCH = [
    "................",
    "......####......",
    ".....#yyyy#.....",
    "......#rr#......",
    ".....##rr##.....",
    "....#bbbbbb#....",
    "...#bbbbbbbb#...",
    "..#bbbbyybbbb#..",
    "..#bbbyyyybbb#..",
    ".#bbbbyybbbbbb#.",
    ".#bbbbbyybbbbb#.",
    ".#bbbbyyyybbbb#.",
    ".#bbbbbyybbbbb#.",
    "..#bbbbbbbbbb#..",
    "...##########...",
    "................",
]
os.makedirs(f"{RP}/textures/items/eco_crates", exist_ok=True)
for tid, name, body, trim, glow, _ in TIERS:
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(KEY):
        for x, ch in enumerate(row):
            if ch == "#":
                img.putpixel((x, y), shade(body, 0.6) + (255,))
            elif ch == "o":
                img.putpixel((x, y), (shade(glow, 1.1) if (x + y) % 4 else shade(trim, 1.2)) + (255,))
    img.save(f"{RP}/textures/items/eco_crates/key_{tid}.png")
img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
pal = {"#": (70, 40, 20), "b": (150, 95, 50), "y": (255, 215, 60), "r": (190, 40, 40)}
for y, row in enumerate(POUCH):
    for x, ch in enumerate(row):
        if ch in pal:
            img.putpixel((x, y), pal[ch] + (255,))
img.save(f"{RP}/textures/items/eco_crates/money_pouch.png")

# ---------------- items ----------------
def item(ident, icon, name, glint=True, stack=64):
    jdump(f"{BP}/items/crates/{ident.split(':')[1]}.json", {
        "format_version": "1.21.60",
        "minecraft:item": {
            "description": {"identifier": ident, "menu_category": {"category": "items"}},
            "components": {
                "minecraft:icon": icon,
                "minecraft:display_name": {"value": name},
                "minecraft:max_stack_size": stack,
                "minecraft:glint": glint,
            },
        },
    })

for tid, name, body, trim, glow, col in TIERS:
    item(f"eco:crate_key_{tid}", f"eco_crate_key_{tid}", f"§r{col}§l{name} Crate Key")
item("eco:money_pouch", "eco_money_pouch", "§r§6§lMoney Pouch §r§7(Use)", stack=1)

tex = json.load(open(f"{RP}/textures/item_texture.json"))
for tid, *_ in TIERS:
    tex["texture_data"][f"eco_crate_key_{tid}"] = {"textures": f"textures/items/eco_crates/key_{tid}"}
tex["texture_data"]["eco_money_pouch"] = {"textures": "textures/items/eco_crates/money_pouch"}
jdump(f"{RP}/textures/item_texture.json", tex)

for lang in ("en_US", "en_GB"):
    p = f"{RP}/texts/{lang}.lang"
    lines = [l for l in open(p).read().splitlines() if "crate" not in l and "money_pouch" not in l]
    for tid, name, *_ in TIERS:
        lines.append(f"item.eco:crate_key_{tid}={name} Crate Key")
    lines += ["item.eco:money_pouch=Money Pouch", "entity.eco:crate.name=Crate", "action.interact.eco_crate=Open"]
    open(p, "w").write("\n".join(lines) + "\n")
print("crates generated")
