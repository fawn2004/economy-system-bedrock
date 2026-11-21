#!/usr/bin/env python3
"""
Generates every texture and structure file used by Skyblock Economy.

    python3 tools/generate_assets.py

- Menu textures (nine-slice panels, tiles, coloured header bars, badges)
- 16x16 pixel-art icons (upscaled x4 so they stay crisp in the UI)
- The menu compass item texture and both pack icons
- One .mcstructure per spawner mob (a mob spawner already set to that mob)

Edit the colours / pixel maps below and re-run to restyle the menus.
Needs Pillow:  pip install pillow
"""
import json
import os
import struct

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "packs")
BP = os.path.join(ROOT, "SkyblockEconomy_BP")
RP = os.path.join(ROOT, "SkyblockEconomy_RP")
UI = os.path.join(RP, "textures", "ui", "eco")


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c[:3]) + (c[3],)


def save(img, path, scale=1):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    img.save(path)


def nineslice_json(path, size, base):
    with open(path, "w") as f:
        json.dump({"nineslice_size": size, "base_size": [base, base]}, f, indent=2)


# --------------------------------------------------------------------------
# Nine-slice frames.  Drawn at 16x16, sliced 4px from each edge.
# --------------------------------------------------------------------------
def frame(outer, light, dark, fill, inner=None, size=16):
    """outer 1px outline, 1px bevel (light top/left, dark bottom/right), fill."""
    img = Image.new("RGBA", (size, size), fill)
    px = img.load()
    for i in range(size):
        for j in range(size):
            if i == 0 or j == 0 or i == size - 1 or j == size - 1:
                px[i, j] = outer
            elif inner and (i == 1 or j == 1 or i == size - 2 or j == size - 2):
                px[i, j] = inner
    o = 2 if inner else 1
    for k in range(o, size - o):
        px[k, o] = light
        px[o, k] = light
        px[k, size - 1 - o] = dark
        px[size - 1 - o, k] = dark
    return img


def make_frames():
    BLACK = hexc("#0c0c0c")
    GOLD = hexc("#f0b232")
    frames = {
        # main window body
        "panel": frame(BLACK, hexc("#3b3b3b"), hexc("#191919"), hexc("#262626")),
        # tiles (button states)
        "tile": frame(hexc("#141414"), hexc("#3e3e3e"), hexc("#222222"), hexc("#2f2f2f")),
        "tile_hover": frame(BLACK, hexc("#454545"), hexc("#2a2a2a"), hexc("#383838"), inner=GOLD),
        "tile_pressed": frame(BLACK, hexc("#1d1d1d"), hexc("#2b2b2b"), hexc("#232323"), inner=hexc("#b9841c")),
        # info strip under the header (gold outlined like the tab buttons)
        "info": frame(BLACK, hexc("#2a2a2a"), hexc("#141414"), hexc("#1c1c1c"), inner=GOLD),
    }
    for name, img in frames.items():
        save(img, os.path.join(UI, name + ".png"))
        nineslice_json(os.path.join(UI, name + ".json"), 4, 16)

    # Coloured header bars, one per theme (theme number = order here, 1-based)
    themes = [
        ("red", "#e31b3b"),
        ("gold", "#e39a17"),
        ("green", "#37a33a"),
        ("blue", "#2c6fd6"),
        ("purple", "#8a3fc7"),
        ("orange", "#e8662a"),
    ]
    for name, col in themes:
        c = hexc(col)
        img = frame(hexc("#120607"), shade(c, 1.35), shade(c, 0.62), c, inner=shade(c, 0.45))
        # second highlight row for a chunky 3D bar
        px = img.load()
        for k in range(2, 14):
            px[k, 3] = shade(c, 1.15)
            px[k, 12] = shade(c, 0.78)
        save(img, os.path.join(UI, "header_" + name + ".png"))
        nineslice_json(os.path.join(UI, "header_" + name + ".json"), 4, 16)


# --------------------------------------------------------------------------
# Pixel-art icons (16x16, saved x4)
# --------------------------------------------------------------------------
PAL = {
    ".": (0, 0, 0, 0),
    "k": hexc("#161616"),
    "w": hexc("#f2f2f2"),
    "W": hexc("#bdbdbd"),
    "y": hexc("#ffd23f"),
    "Y": hexc("#c98d12"),
    "r": hexc("#e53935"),
    "R": hexc("#9e1d1d"),
    "g": hexc("#5fcf3f"),
    "G": hexc("#2e8b2e"),
    "b": hexc("#3f8cff"),
    "B": hexc("#1f4fa8"),
    "c": hexc("#5ee6e6"),
    "C": hexc("#2a9fa6"),
    "n": hexc("#a0672f"),
    "N": hexc("#6b4019"),
    "s": hexc("#9a9a9a"),
    "S": hexc("#5c5c5c"),
    "o": hexc("#ff9a1f"),
    "O": hexc("#d4520e"),
    "p": hexc("#b45be0"),
    "P": hexc("#6e2a99"),
    "d": hexc("#2b2b2b"),
}

ICONS = {
    # shop: treasure chest
    "shop": """
................
................
...kkkkkkkkkk...
..knnnnnnnnnnk..
.knnnnnnnnnnnnk.
.knNNNNNNNNNNnk.
.kNNNNNNNNNNNNk.
.kkkkkkyykkkkkk.
.knnnnyYYynnnnk.
.knnnnnyynnnnnk.
.knnnnnnnnnnnnk.
.knnnnnnnnnnnnk.
.kNNNNNNNNNNNNk.
.kkkkkkkkkkkkkk.
................
................""",
    # sell: coin with green up-arrow
    "sell": """
................
...........g....
..........ggg...
.........ggggg..
....kkkk...g....
..kkyyyykk.g....
.kyyyyyyyyk.....
.kyyYYYYyyk.....
kyyyYyyyyyyk....
kyyyyYYyyyyk....
kyyyyyyYyyyk....
.kyyYYYYyyk.....
.kyyyyyyyyk.....
..kkYYYYkk......
....kkkk........
................""",
    # bank / balance: stack of coins
    "bank": """
................
................
.....kkkkkk.....
....kyyyyyyk....
....kYYYYYYk....
....kkkkkkkk....
...kyyyyyyyyk...
...kYYYYYYYYk...
...kkkkkkkkkk...
..kyyyyyyyyyyk..
..kYYYYYYYYYYk..
..kkkkkkkkkkkk..
.kyyyyyyyyyyyyk.
.kYYYYYYYYYYYYk.
.kkkkkkkkkkkkkk.
................""",
    # pay: two arrows swapping
    "pay": """
................
..........k.....
..........kk....
.kkkkkkkkkkgk...
.kggggggggggGk..
.kGGGGGGGGGGk...
..........kk....
....k.....k.....
...kk...........
..kyk...........
.kYyyyyyyyyyyk..
..kYYYYYYYYYYk..
...kk..kkkkkkk..
....k...........
................
................""",
    # leaderboard: trophy
    "top": """
................
...kkkkkkkkkk...
.kkyyyyyyyyyykk.
kyykyyyyyyyykyyk
ky.kyyywyyyyk.yk
kyykyyywyyyykyyk
.kkkyyyyyyyykkk.
...kYyyyyyyYk...
....kYyyyyYk....
.....kYyyYk.....
......kyyk......
......kYYk......
....kkyyyykk....
...kYYYYYYYYk...
...kkkkkkkkkk...
................""",
    # admin: shield with star
    "admin": """
................
..kkkkkkkkkkkk..
..kRrrrrrrrrRk..
..krrrrwrrrrrk..
..krrrrwrrrrrk..
..krrwwwwwrrrk..
..krrrwwwrrrrk..
..krrrwrwrrrrk..
..kRrrrrrrrrRk..
...kRrrrrrrRk...
...kRrrrrrrRk...
....kRrrrrRk....
.....kRrrRk.....
......kRRk......
.......kk.......
................""",
    # back arrow
    "back": """
................
................
................
......kk........
.....kwk........
....kwwkkkkkkk..
...kwwwwwwwwwwk.
..kwwwwwwwwwwwk.
...kWwwwwwwwwWk.
....kWWkkkkkkk..
.....kWk........
......kk........
................
................
................
................""",
    # blocks: grass block
    "blocks": """
................
.kkkkkkkkkkkkkk.
.kggggggggggggk.
.kgGggggGgggGgk.
.kGgGgGGgGgGgGk.
.kGnGnGnnGnGnGk.
.knnnNnnnnnNnnk.
.knNnnnnNnnnnnk.
.knnnnnnnnnNnnk.
.knnNnnnnnnnnnk.
.knnnnnNnnnnNnk.
.kNnnnnnnnNnnnk.
.knnnNnnnnnnnnk.
.kNNNNNNNNNNNNk.
.kkkkkkkkkkkkkk.
................""",
    # food: drumstick
    "food": """
................
.........kkkk...
.......kkoooOk..
......koooooOOk.
.....koooooooOk.
.....kooOoooOOk.
.....kooooooOOk.
......koooOOOk..
......kkOOOOk...
.....kwkkkkk....
....kwWk........
...kwWk.........
.kkwWk..........
kwwWk...........
.kkk............
................""",
    # kits: diamond chestplate
    "kits": """
................
..kkkk....kkkk..
.kccCck..kcCcck.
.kcccckkkkccccck
kcccccccccccccck
kcckcccccccckcck
.kk.kcccccck.kk.
....kcCcccCk....
....kccccccck...
....kcccccck....
....kcCcccCk....
....kcccccck....
....kCccccCk....
....kkkkkkkk....
................
................""",
    # spawners: cage with a flame
    "spawners": """
................
.kkkkkkkkkkkkkk.
.kSssSssSssSssk.
.ks.kS..Sk..ksk.
.kS.dS..Sd..dSk.
.kSssSssSssSssk.
.ks..S.oS...dsk.
.kS..SooO...dSk.
.ks.koyoOo..dsk.
.kSssSyyOssSssk.
.ks.kSyoS...ksk.
.kS.dS..Sd..dSk.
.kSssSssSssSssk.
.kSSSSSSSSSSSSk.
.kkkkkkkkkkkkkk.
................""",
    # farming: wheat bundle
    "farming": """
................
....y...y...y...
...yYy.yYy.yYy..
....y...y...y...
...yYy.yYy.yYy..
....y...y...y...
....yy..y..yy...
.....y..y..y....
......yyyyy.....
......NnnnN.....
......yyyyy.....
.....y..y..y....
....y...y...y...
...Y....Y....Y..
................
................""",
    # player head (pay targets / admin targets)
    "player": """
................
...kkkkkkkkkk...
...kNNNNNNNNk...
...kNNNNNNNNk...
...knnnnnnnnk...
...knwBnnBwnk...
...knnnnnnnnk...
...knnNNNNnnk...
...kkkkkkkkkk...
..kbbbbbbbbbbk..
.kbbbbbbbbbbbbk.
.kbbbbbbbbbbbbk.
.knkbbbbbbbbknk.
.knkbbbbbbbbknk.
.kkkkkkkkkkkkkk.
................""",
    # confirm tick
    "confirm": """
................
................
.............kk.
............kgk.
...........kggk.
..kk......kggk..
.kggk....kggk...
.kgggk..kggk....
..kgggkkggk.....
...kggggggk.....
....kggggk......
.....kggk.......
......kk........
................
................
................""",
    # cancel / red X
    "cancel": """
................
................
..kk........kk..
.krrk......krrk.
.krrrk....krrrk.
..krrrk..krrrk..
...krrrkkrrrk...
....krrrrrrk....
....krrrrrrk....
...krrrkkrrrk...
..krrrk..krrrk..
.krrrk....krrrk.
.krrk......krrk.
..kk........kk..
................
................""",
    # magnifying glass (search)
    "search": """
................
....kkkkk.......
...kwwwwwk......
..kwbbbbbwk.....
.kwbbwwbbbwk....
.kwbwwbbbbwk....
.kwbwbbbbbwk....
.kwbbbbbbbwk....
.kwbbbbbbbwk....
..kwbbbbbwk.....
...kwwwwwkk.....
....kkkkkYnk....
.........kYnk...
..........kYnk..
...........kYk..
............kk..""",
    # gold coin (amount buttons)
    "coin": """
................
................
.....kkkkkk.....
...kkyyyyyykk...
..kyyyyyyyyyyk..
..kyyYYYYYyyyk..
.kyyyYyyyyyyyyk.
.kyyyyYYYyyyyyk.
.kyyyyyyyYyyyyk.
.kyyyyyyyYyyyyk.
..kyyYYYYYyyyk..
..kyyyyyyyyyyk..
...kkYYYYYYkk...
.....kkkkkk.....
................
................""",
}


def make_icons():
    for name, art in ICONS.items():
        rows = [r for r in art.strip("\n").split("\n")]
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        px = img.load()
        for y, row in enumerate(rows[:16]):
            for x, ch in enumerate(row[:16]):
                px[x, y] = PAL.get(ch, (0, 0, 0, 0))
        save(img, os.path.join(UI, "icon_" + name + ".png"), scale=4)


# --------------------------------------------------------------------------
# Badges ("NEW!", "HOT!") drawn with a tiny 3x5 pixel font
# --------------------------------------------------------------------------
FONT = {
    "N": ["X..X", "XX.X", "X.XX", "X..X", "X..X"],
    "E": ["XXX", "X..", "XX.", "X..", "XXX"],
    "W": ["X...X", "X...X", "X.X.X", "XX.XX", "X...X"],
    "H": ["X.X", "X.X", "XXX", "X.X", "X.X"],
    "O": ["XXX", "X.X", "X.X", "X.X", "XXX"],
    "T": ["XXX", ".X.", ".X.", ".X.", ".X."],
    "!": ["X", "X", "X", ".", "X"],
}


def badge(text, bg, edge, fg):
    widths = [len(FONT[ch][0]) for ch in text]
    w = sum(widths) + (len(text) - 1) + 6
    h = 9
    img = Image.new("RGBA", (w, h), edge)
    px = img.load()
    for x in range(1, w - 1):
        for y in range(1, h - 1):
            px[x, y] = bg
    for x in range(1, w - 1):
        px[x, 1] = shade(bg, 1.25)
    cx = 3
    for ch, cw in zip(text, widths):
        for gy, row in enumerate(FONT[ch]):
            for gx, bit in enumerate(row):
                if bit == "X":
                    px[cx + gx, 2 + gy] = fg
        cx += cw + 1
    save(img, os.path.join(UI, "badge_" + text.strip("!").lower() + ".png"), scale=4)


def make_badges():
    badge("NEW!", hexc("#f0b232"), hexc("#3a2500"), hexc("#3a2500"))
    badge("HOT!", hexc("#e53935"), hexc("#3a0505"), hexc("#ffffff"))


# --------------------------------------------------------------------------
# Close button (12x12 art, x4)
# --------------------------------------------------------------------------
def make_close():
    for name, fill, edge in (("close", hexc("#262626"), hexc("#0c0c0c")),
                             ("close_hover", hexc("#e31b3b"), hexc("#3a0505"))):
        img = Image.new("RGBA", (12, 12), edge)
        px = img.load()
        for x in range(1, 11):
            for y in range(1, 11):
                px[x, y] = fill
        for x in range(1, 11):
            px[x, 1] = shade(fill, 1.4)
            px[x, 10] = shade(fill, 0.6)
        for i in range(3, 9):
            px[i, i] = hexc("#ffffff")
            px[11 - i, i] = hexc("#ffffff")
        save(img, os.path.join(UI, name + ".png"), scale=4)


# --------------------------------------------------------------------------
# Compass item + pack icons
# --------------------------------------------------------------------------
def compass_img():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    cx = cy = 7.5
    for x in range(16):
        for y in range(16):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d <= 7.6:
                px[x, y] = PAL["k"]
            if d <= 6.6:
                px[x, y] = PAL["Y"] if (x + y) > 15 else PAL["y"]
            if d <= 5.2:
                px[x, y] = hexc("#2a2a2a")
            if d <= 4.4:
                px[x, y] = hexc("#e8e2d0")
    # needle: red north, blue south
    for (x, y) in [(7, 3), (8, 3), (7, 4), (8, 4), (7, 5), (8, 5), (7, 6), (8, 6)]:
        px[x, y] = PAL["r"]
    for (x, y) in [(7, 9), (8, 9), (7, 10), (8, 10), (7, 11), (8, 11)]:
        px[x, y] = PAL["B"]
    for (x, y) in [(7, 7), (8, 7), (7, 8), (8, 8)]:
        px[x, y] = PAL["k"]
    px[3, 7] = px[12, 8] = PAL["S"]
    return img


def make_pack_icons():
    c = compass_img()
    save(c, os.path.join(RP, "textures", "items", "eco_menu_compass.png"))
    for pack in (BP, RP):
        bg = Image.new("RGBA", (16, 16), hexc("#e31b3b"))
        p = bg.load()
        for i in range(16):
            p[i, 0] = p[0, i] = p[i, 15] = p[15, i] = hexc("#120607")
            p[i, 14] = p[14, i] = shade(hexc("#e31b3b"), 0.6) if i else p[i, 14]
        bg.alpha_composite(c)
        save(bg, os.path.join(pack, "pack_icon.png"), scale=16)


# --------------------------------------------------------------------------
# Spawner structures (.mcstructure = little-endian NBT)
# --------------------------------------------------------------------------
class T:
    BYTE, SHORT, INT, FLOAT, STRING, LIST, COMPOUND = 1, 2, 3, 5, 8, 9, 10


def _str(s):
    b = s.encode("utf-8")
    return struct.pack("<H", len(b)) + b


def nbt_payload(tag, val):
    if tag == T.BYTE:
        return struct.pack("<b", val)
    if tag == T.SHORT:
        return struct.pack("<h", val)
    if tag == T.INT:
        return struct.pack("<i", val)
    if tag == T.FLOAT:
        return struct.pack("<f", val)
    if tag == T.STRING:
        return _str(val)
    if tag == T.LIST:
        item_tag, items = val
        out = struct.pack("<bi", item_tag, len(items))
        return out + b"".join(nbt_payload(item_tag, i) for i in items)
    if tag == T.COMPOUND:
        out = b""
        for name, (t, v) in val.items():
            out += struct.pack("<b", t) + _str(name) + nbt_payload(t, v)
        return out + b"\x00"
    raise ValueError(tag)


def spawner_structure(mob):
    ident = mob if ":" in mob else "minecraft:" + mob
    block_entity = {
        "id": (T.STRING, "MobSpawner"),
        "isMovable": (T.BYTE, 1),
        "x": (T.INT, 0), "y": (T.INT, 0), "z": (T.INT, 0),
        "EntityIdentifier": (T.STRING, ident),
        "Delay": (T.SHORT, 20),
        "MinSpawnDelay": (T.SHORT, 200),
        "MaxSpawnDelay": (T.SHORT, 800),
        # Display only: the add-on's script does the spawning (stacking, upgrades,
        # mob stacking, heads), so the vanilla spawner itself never spawns.
        "SpawnCount": (T.SHORT, 0),
        "MaxNearbyEntities": (T.SHORT, 0),
        "RequiredPlayerRange": (T.SHORT, 16),
        "SpawnRange": (T.SHORT, 4),
        "DisplayEntityWidth": (T.FLOAT, 0.8),
        "DisplayEntityHeight": (T.FLOAT, 1.8),
        "DisplayEntityScale": (T.FLOAT, 1.0),
    }
    root = {
        "format_version": (T.INT, 1),
        "size": (T.LIST, (T.INT, [1, 1, 1])),
        "structure_world_origin": (T.LIST, (T.INT, [0, 0, 0])),
        "structure": (T.COMPOUND, {
            "block_indices": (T.LIST, (T.LIST, [(T.INT, [0]), (T.INT, [-1])])),
            "entities": (T.LIST, (T.COMPOUND, [])),
            "palette": (T.COMPOUND, {
                "default": (T.COMPOUND, {
                    "block_palette": (T.LIST, (T.COMPOUND, [{
                        "name": (T.STRING, "minecraft:mob_spawner"),
                        "states": (T.COMPOUND, {}),
                        "version": (T.INT, 18153475),
                    }])),
                    "block_position_data": (T.COMPOUND, {
                        "0": (T.COMPOUND, {"block_entity_data": (T.COMPOUND, block_entity)}),
                    }),
                }),
            }),
        }),
    }
    return struct.pack("<b", T.COMPOUND) + _str("") + nbt_payload(T.COMPOUND, root)


# ---------------------------------------------------------------------------
# Spawner mobs.  Keep in sync with SPAWNERS in scripts/config.js.
#   mob id: (display name, head colours: skin, second colour, eyes, mouth/nose)
# ---------------------------------------------------------------------------
MOBS = {
    "pig":            ("Pig",              "#f0a5a2", "#e08a87", "#2b1d1d", "#c86f6c"),
    "cow":            ("Cow",              "#4a3426", "#f2f2f2", "#111111", "#b8b0a8"),
    "chicken":        ("Chicken",          "#f7f7f7", "#e0e0e0", "#111111", "#f2a51b"),
    "sheep":          ("Sheep",            "#ececec", "#d8c3a5", "#2b2b2b", "#b89d82"),
    "rabbit":         ("Rabbit",           "#a77d55", "#e8d6c0", "#111111", "#f0a5a2"),
    "mooshroom":      ("Mooshroom",        "#a62a2a", "#d9d9d9", "#111111", "#b8b0a8"),
    "zombie":         ("Zombie",           "#4f8a3c", "#3c6e2e", "#1a1a1a", "#2f5524"),
    "husk":           ("Husk",             "#b39a6b", "#8f7a52", "#1a1a1a", "#6e5c3c"),
    "drowned":        ("Drowned",          "#4e9c9a", "#3a7a78", "#7ff0ff", "#2b5c5a"),
    "skeleton":       ("Skeleton",         "#c9c9c9", "#a8a8a8", "#1a1a1a", "#555555"),
    "stray":          ("Stray",            "#a9c3c6", "#7f9fa3", "#1a1a1a", "#4f6467"),
    "wither_skeleton": ("Wither Skeleton", "#2b2b2b", "#1e1e1e", "#0a0a0a", "#5a5a5a"),
    "spider":         ("Spider",           "#3a3330", "#2a2421", "#e53935", "#1a1414"),
    "cave_spider":    ("Cave Spider",      "#1f4a52", "#16363c", "#e53935", "#0f2429"),
    "creeper":        ("Creeper",          "#4fb03c", "#3c8f2e", "#111111", "#111111"),
    "slime":          ("Slime",            "#7cd65f", "#5fb845", "#2a5a1f", "#2a5a1f"),
    "magma_cube":     ("Magma Cube",       "#5a1f0f", "#e8662a", "#ffd23f", "#ff9a1f"),
    "witch":          ("Witch",            "#b08c6c", "#5a2d7a", "#3fae3a", "#8f6a4c"),
    "enderman":       ("Enderman",         "#161616", "#0f0f0f", "#d26bff", "#161616"),
    "blaze":          ("Blaze",            "#f2c12e", "#c98d12", "#3a2500", "#e8702a"),
    "ghast":          ("Ghast",            "#f2f2f2", "#d6d6d6", "#3a3a3a", "#9e1d1d"),
    "guardian":       ("Guardian",         "#5f9e8a", "#e8902a", "#f2e6c8", "#3f6e60"),
    "zombie_pigman":  ("Zombified Piglin", "#e39a92", "#5f8a3c", "#1a1a1a", "#b86f66"),
    "iron_golem":     ("Iron Golem",       "#d6cfc4", "#b5ada0", "#8a1d1d", "#7a6a55"),
}
SPAWNER_MOBS = list(MOBS)

HEAD_FACE = [
    "................",
    ".kkkkkkkkkkkkkk.",
    ".kSSSSSSSSSSSSk.",
    ".kSTSSSSSSSSTSk.",
    ".kSSSSSSSSSSSSk.",
    ".kSSSSSSSSSSSSk.",
    ".kSEESSSSSSEESk.",
    ".kSEESSSSSSEESk.",
    ".kSSSSSSSSSSSSk.",
    ".kSSSSMMMMSSSSk.",
    ".kSSSSMMMMSSSSk.",
    ".kSSSTSSSSTSSSk.",
    ".kSSSSSSSSSSSSk.",
    ".kTTTTTTTTTTTTk.",
    ".kkkkkkkkkkkkkk.",
    "................",
]


def make_heads():
    """An 'Enchanted <Mob> Head' item (texture + item json) for every spawner mob."""
    tex_dir = os.path.join(RP, "textures", "items", "eco_heads")
    item_dir = os.path.join(BP, "items", "heads")
    os.makedirs(item_dir, exist_ok=True)
    tex_data = {"eco_menu_compass": {"textures": "textures/items/eco_menu_compass"}}
    for mob, (name, skin, second, eyes, mouth) in MOBS.items():
        cols = {"k": hexc("#161616"), "S": hexc(skin), "T": hexc(second), "E": hexc(eyes), "M": hexc(mouth)}
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        px = img.load()
        for y, row in enumerate(HEAD_FACE):
            for x, ch in enumerate(row):
                if ch in cols:
                    px[x, y] = cols[ch]
        for (x, y) in ((0, 0), (15, 2), (14, 14)):  # enchant sparkles
            px[x, y] = hexc("#d98cff")
        save(img, os.path.join(tex_dir, mob + ".png"))
        tex_data[f"eco_head_{mob}"] = {"textures": f"textures/items/eco_heads/{mob}"}
        item = {
            "format_version": "1.21.60",
            "minecraft:item": {
                "description": {"identifier": f"eco:head_{mob}", "menu_category": {"category": "items"}},
                "components": {
                    "minecraft:icon": f"eco_head_{mob}",
                    "minecraft:display_name": {"value": f"§r§dEnchanted {name} Head"},
                    "minecraft:max_stack_size": 64,
                    "minecraft:glint": True,
                },
            },
        }
        with open(os.path.join(item_dir, f"head_{mob}.json"), "w") as f:
            json.dump(item, f, indent=2, ensure_ascii=False)
    with open(os.path.join(RP, "textures", "item_texture.json"), "w") as f:
        json.dump({"resource_pack_name": "skyblock_economy", "texture_name": "atlas.items",
                   "texture_data": tex_data}, f, indent=2)
    with open(os.path.join(RP, "texts", "en_US.lang"), "w") as f:
        f.write("item.eco:menu_compass=Menu Compass\npack.name=Skyblock Economy\npack.description=Custom economy menus\n")
        for mob, (name, *_r) in MOBS.items():
            f.write(f"item.eco:head_{mob}=Enchanted {name} Head\n")
    import shutil
    shutil.copy(os.path.join(RP, "texts", "en_US.lang"), os.path.join(RP, "texts", "en_GB.lang"))


def make_structures():
    out = os.path.join(BP, "structures", "eco")
    os.makedirs(out, exist_ok=True)
    for old in os.listdir(out):
        os.remove(os.path.join(out, old))
    for mob in SPAWNER_MOBS:
        with open(os.path.join(out, "spawner_" + mob + ".mcstructure"), "wb") as f:
            f.write(spawner_structure(mob))


# --------------------------------------------------------------------------
# Shape icons for the Wood / Stone sub-sections (stairs, slab, fence, wall)
# --------------------------------------------------------------------------
SHAPES = {
    "stairs": ["........########", "........########", "........########", "........########",
               "........########", "........########", "........########", "........########",
               "################", "################", "################", "################",
               "################", "################", "################", "################"],
    "slab": ["." * 16] * 8 + ["#" * 16] * 8,
    "fence": ["..##........##..", "..##........##..", "..##........##..", "################",
              "################", "..##........##..", "..##........##..", "..##........##..",
              "################", "################", "..##........##..", "..##........##..",
              "..##........##..", "..##........##..", "..##........##..", "..##........##.."],
    "wall": ["###..........###", "###..........###", "###..........###", "###..........###",
             "################", "################", "################", "################",
             "################", "################", "################", "################",
             "################", "################", "################", "################"],
}


def shape_icon(shape, material):
    rows = SHAPES[shape]
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    for y in range(16):
        for x in range(16):
            if rows[y][x] != "#":
                continue
            if material == "wood":  # planks: horizontal boards with seams
                c = hexc("#b8874a") if (y // 4) % 2 == 0 else hexc("#a47740")
                if y % 4 == 3:
                    c = hexc("#7a5528")
                if (x + (y // 4) * 5) % 8 == 0:
                    c = hexc("#7a5528")
            else:  # stone bricks
                c = hexc("#8f8f8f") if (x * 7 + y * 3) % 5 else hexc("#7d7d7d")
                if y % 4 == 3 or (x + (4 if (y // 4) % 2 else 0)) % 8 == 7:
                    c = hexc("#5e5e5e")
            px[x, y] = c
    # dark outline
    out = img.copy()
    o = out.load()
    for y in range(16):
        for x in range(16):
            if px[x, y][3] == 0 and any(
                0 <= x + dx < 16 and 0 <= y + dy < 16 and px[x + dx, y + dy][3]
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                o[x, y] = hexc("#1b1b1b")
    save(out, os.path.join(UI, f"icon_{shape}_{material}.png"), scale=4)


def make_shapes():
    for shape in ("stairs", "slab", "fence"):
        shape_icon(shape, "wood")
    for shape in ("stairs", "slab", "wall"):
        shape_icon(shape, "stone")


# ---------------------------------------------------------------------------
# Enchanted crops (dropped when harvesting; used to upgrade the Farming Hoe).
# Keep in sync with CROPS in scripts/config.js.  id: (name, vanilla texture)
# ---------------------------------------------------------------------------
ENCHANTED_CROPS = {
    "wheat": ("Wheat", "textures/items/wheat"),
    "carrot": ("Carrot", "textures/items/carrot"),
    "potato": ("Potato", "textures/items/potato"),
    "beetroot": ("Beetroot", "textures/items/beetroot"),
    "nether_wart": ("Nether Wart", "textures/items/nether_wart"),
    "cocoa": ("Cocoa Beans", "textures/items/dye_powder_brown"),
    "melon": ("Melon", "textures/items/melon"),
    "pumpkin": ("Pumpkin", "textures/blocks/pumpkin_face_off"),
    "sugar_cane": ("Sugar Cane", "textures/items/reeds"),
    "cactus": ("Cactus", "textures/blocks/cactus_side"),
}


def make_enchanted_crops():
    item_dir = os.path.join(BP, "items", "crops")
    os.makedirs(item_dir, exist_ok=True)
    tex_path = os.path.join(RP, "textures", "item_texture.json")
    data = json.load(open(tex_path))
    lang_lines = []
    for cid, (name, tex) in ENCHANTED_CROPS.items():
        data["texture_data"][f"eco_enchanted_{cid}"] = {"textures": tex}
        item = {
            "format_version": "1.21.60",
            "minecraft:item": {
                "description": {"identifier": f"eco:enchanted_{cid}", "menu_category": {"category": "items"}},
                "components": {
                    "minecraft:icon": f"eco_enchanted_{cid}",
                    "minecraft:display_name": {"value": f"§r§aEnchanted {name}"},
                    "minecraft:max_stack_size": 64,
                    "minecraft:glint": True,
                },
            },
        }
        with open(os.path.join(item_dir, f"enchanted_{cid}.json"), "w") as f:
            json.dump(item, f, indent=2, ensure_ascii=False)
        lang_lines.append(f"item.eco:enchanted_{cid}=Enchanted {name}\n")
    with open(tex_path, "w") as f:
        json.dump(data, f, indent=2)
    for lang in ("en_US", "en_GB"):
        with open(os.path.join(RP, "texts", lang + ".lang"), "a") as f:
            f.writelines(lang_lines)


# ---------------------------------------------------------------------------
# Mining minion: custom entity (model, skin, animation) + its display block
# entity + the minion item. Tier textures must match MINION_TIERS order in
# scripts/config.js (8 tiers).
# ---------------------------------------------------------------------------
B, I = "textures/blocks/", "textures/items/"
# Minion types. Each tier: (name, drop item, count, sell value per item or None
# for "shop sell price x lootMultiplier", upgrade cost, display block texture,
# item icon texture). Written to scripts/minion_types.js.
MINION_TYPES = [
    {"id": "mining", "name": "Mining", "price": 25000, "upgradeMultiplier": 1,
     "skin": ("#f2c12e", "#c98d12", "#3f6fd1", "#2c4f99"),
     "tiers": [
         ("Cobblestone", "cobblestone", 1, None, 0, B + "cobblestone", B + "cobblestone"),
         ("Coal", "coal", 1, None, 50000, B + "coal_ore", I + "coal"),
         ("Iron", "raw_iron", 1, None, 150000, B + "iron_ore", I + "raw_iron"),
         ("Gold", "raw_gold", 1, None, 350000, B + "gold_ore", I + "raw_gold"),
         ("Lapis", "lapis_lazuli", 4, None, 600000, B + "lapis_ore", I + "dye_powder_blue"),
         ("Redstone", "redstone", 4, None, 1000000, B + "redstone_ore", I + "redstone_dust"),
         ("Diamond", "diamond", 1, None, 2500000, B + "diamond_ore", I + "diamond"),
         ("Emerald", "emerald", 1, None, 5000000, B + "emerald_ore", I + "emerald"),
     ]},
    {"id": "nether", "name": "Nether", "price": 150000, "upgradeMultiplier": 3,
     "skin": ("#c0392b", "#7a1f1f", "#5a1a1a", "#3a0f0f"),
     "tiers": [
         ("Netherrack", "netherrack", 1, 1200, 0, B + "netherrack", B + "netherrack"),
         ("Soul Sand", "soul_sand", 1, 1500, 300000, B + "soul_sand", B + "soul_sand"),
         ("Quartz", "quartz", 1, 1900, 600000, B + "quartz_ore", I + "quartz"),
         ("Glowstone", "glowstone_dust", 1, 2400, 1200000, B + "glowstone", I + "glowstone_dust"),
         ("Magma", "magma_cream", 1, 3000, 2000000, B + "magma", I + "magma_cream"),
         ("Blaze Rod", "blaze_rod", 1, 3800, 3500000, B + "nether_wart_block", I + "blaze_rod"),
         ("Ancient Debris", "ancient_debris", 1, 4800, 6000000, B + "ancient_debris_side", B + "ancient_debris_side"),
         ("Netherite Scrap", "netherite_scrap", 1, 6000, 10000000, B + "netherite_block", I + "netherite_scrap"),
     ]},
    {"id": "obsidian", "name": "Obsidian", "price": 2000000, "upgradeMultiplier": 8,
     "skin": ("#6c3fb0", "#45267a", "#2a1f3d", "#17112a"),
     "tiers": [
         ("Obsidian", "obsidian", 1, 7000, 0, B + "obsidian", B + "obsidian"),
         ("Crying Obsidian", "crying_obsidian", 1, 8500, 3000000, B + "crying_obsidian", B + "crying_obsidian"),
         ("Amethyst", "amethyst_shard", 1, 10000, 5000000, B + "amethyst_block", I + "amethyst_shard"),
         ("Sea Lantern", "sea_lantern", 1, 12500, 8000000, B + "sea_lantern", B + "sea_lantern"),
         ("Shroomlight", "shroomlight", 1, 15000, 12000000, B + "shroomlight", B + "shroomlight"),
         ("Sculk Catalyst", "sculk_catalyst", 1, 18000, 18000000, B + "sculk_catalyst_side", B + "sculk_catalyst_side"),
         ("Echo Shard", "echo_shard", 1, 22000, 26000000, B + "sculk", I + "echo_shard"),
         ("Heavy Core", "heavy_core", 1, 27000, 40000000, B + "heavy_core", B + "heavy_core"),
     ]},
    {"id": "end", "name": "End", "price": 10000000, "upgradeMultiplier": 20,
     "skin": ("#e8e2a8", "#b8b27a", "#8e5fb5", "#5f3d80"),
     "tiers": [
         ("End Stone", "end_stone", 1, 30000, 0, B + "end_stone", B + "end_stone"),
         ("Purpur", "purpur_block", 1, 36000, 12000000, B + "purpur_block", B + "purpur_block"),
         ("Chorus Fruit", "chorus_fruit", 1, 43000, 18000000, B + "chorus_flower", I + "chorus_fruit"),
         ("Ender Pearl", "ender_pearl", 1, 52000, 26000000, B + "end_bricks", I + "ender_pearl"),
         ("Shulker Shell", "shulker_shell", 1, 62000, 38000000, B + "shulker_top_undyed", I + "shulker_shell"),
         ("End Crystal", "end_crystal", 1, 75000, 55000000, B + "purpur_pillar", I + "end_crystal"),
         ("Dragon's Breath", "dragon_breath", 1, 90000, 80000000, B + "purpur_pillar_top", I + "dragons_breath"),
         ("Dragon Egg", "dragon_egg", 1, 110000, 120000000, B + "dragon_egg", B + "dragon_egg"),
     ]},
    {"id": "bedrock", "name": "Bedrock", "price": 50000000, "upgradeMultiplier": 50,
     "skin": ("#4a4a4a", "#2a2a2a", "#222222", "#111111"),
     "tiers": [
         ("Bedrock", "bedrock", 1, 125000, 0, B + "bedrock", B + "bedrock"),
         ("Reinforced Deepslate", "reinforced_deepslate", 1, 150000, 60000000, B + "reinforced_deepslate_top", B + "reinforced_deepslate_top"),
         ("Budding Amethyst", "budding_amethyst", 1, 180000, 90000000, B + "budding_amethyst", B + "budding_amethyst"),
         ("End Portal Frame", "end_portal_frame", 1, 215000, 130000000, B + "endframe_top", B + "endframe_top"),
         ("Spawner", "mob_spawner", 1, 260000, 190000000, B + "mob_spawner", B + "mob_spawner"),
         ("Beacon", "beacon", 1, 310000, 270000000, B + "beacon", B + "beacon"),
         ("Netherite Block", "netherite_block", 1, 375000, 380000000, B + "netherite_block", B + "netherite_block"),
         ("Nether Star", "nether_star", 1, 450000, 550000000, B + "beacon", I + "nether_star"),
     ]},
]
DISPLAY_TEXTURES = [t[5] for mt in MINION_TYPES for t in mt["tiers"]]


def write_minion_types_js():
    out, idx = [], 0
    for si, mt in enumerate(MINION_TYPES):
        tiers = []
        for (name, base, count, value, cost, _disp, _icon) in mt["tiers"]:
            t = {"name": name, "drop": ["minecraft:" + base, count], "cost": cost, "display": idx}
            if value is not None:
                t["value"] = value
            tiers.append(t)
            idx += 1
        out.append({"id": mt["id"], "name": mt["name"], "price": mt["price"],
                    "upgradeMultiplier": mt["upgradeMultiplier"], "skin": si, "tiers": tiers})
    path = os.path.join(BP, "scripts", "minion_types.js")
    with open(path, "w") as f:
        f.write("// AUTO-GENERATED by tools/generate_assets.py (MINION_TYPES).\n")
        f.write("// Change prices/costs/values in-game (Admin > Settings > Minions) or there.\n")
        f.write("// value = sell price of one enchanted item (no value = shop sell price x lootMultiplier)\n")
        f.write("// display = block texture index in the resource pack (don't change by hand)\n")
        f.write("export const MINION_TYPES = " + json.dumps(out, indent=2) + ";\n")




def minion_skin(colors=("#f2c12e", "#c98d12", "#3f6fd1", "#2c4f99")):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    px = img.load()

    def fill(x0, y0, x1, y1, c):
        for x in range(x0, x1):
            for y in range(y0, y1):
                px[x, y] = c

    skin, skin_d = hexc("#e8b07a"), hexc("#c98f5a")
    helmet, helmet_d = hexc(colors[0]), hexc(colors[1])
    shirt, overall, overall_d = hexc("#8a5a2b"), hexc(colors[2]), hexc(colors[3])
    boot = hexc("#3a2a1a")
    # head (box uv at 0,0; 8x8x8)
    fill(0, 0, 32, 16, skin)
    fill(8, 0, 16, 8, helmet)                      # top
    for (x0, x1) in ((0, 8), (8, 16), (16, 24), (24, 32)):   # helmet band on all sides
        fill(x0, 8, x1, 11, helmet)
        fill(x0, 10, x1, 11, helmet_d)
    px[11, 9] = px[12, 9] = hexc("#ffffff")        # lamp
    px[11, 8] = px[12, 8] = hexc("#fff3a0")
    fill(9, 12, 11, 13, hexc("#ffffff")); px[10, 12] = hexc("#2b4fa8")   # eyes
    fill(13, 12, 15, 13, hexc("#ffffff")); px[13, 12] = hexc("#2b4fa8")
    fill(11, 14, 13, 15, skin_d)                   # mouth
    # body (16,16; 8x12x4)
    fill(16, 16, 40, 32, overall)
    fill(20, 20, 28, 23, shirt)
    px[21, 23] = px[26, 23] = hexc("#f2c12e")      # buttons
    fill(16, 30, 40, 32, overall_d)
    # right arm (40,16) / left arm (32,48): sleeve + hand
    for (x0, y0) in ((40, 16), (32, 48)):
        fill(x0, y0, x0 + 16, y0 + 16, shirt)
        fill(x0, y0 + 12, x0 + 16, y0 + 16, skin)
    # legs (0,16) / (16,48)
    for (x0, y0) in ((0, 16), (16, 48)):
        fill(x0, y0, x0 + 16, y0 + 16, overall)
        fill(x0, y0 + 12, x0 + 16, y0 + 16, boot)
    # pickaxe: handle (32,0 18x9), head (52,0 4x8)
    fill(32, 0, 50, 9, hexc("#8a5a2b"))
    fill(52, 0, 56, 8, hexc("#5ee6e6"))
    return img


def make_minions():
    ent_dir = os.path.join(RP, "entity")
    os.makedirs(ent_dir, exist_ok=True)
    os.makedirs(os.path.join(RP, "models", "entity"), exist_ok=True)
    os.makedirs(os.path.join(RP, "animations"), exist_ok=True)
    os.makedirs(os.path.join(RP, "render_controllers"), exist_ok=True)
    os.makedirs(os.path.join(BP, "entities"), exist_ok=True)
    save(minion_skin(), os.path.join(RP, "textures", "entity", "eco_minion.png"))
    for si, mt in enumerate(MINION_TYPES):
        save(minion_skin(mt["skin"]), os.path.join(RP, "textures", "entity", f"eco_minion_{mt['id']}.png"))
    write_minion_types_js()

    # --- minion model (front = -Z) ---
    geo = {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {"identifier": "geometry.eco_minion", "texture_width": 64, "texture_height": 64,
                            "visible_bounds_width": 2, "visible_bounds_height": 2.5, "visible_bounds_offset": [0, 1, 0]},
            "bones": [
                {"name": "root", "pivot": [0, 0, 0]},
                {"name": "body", "parent": "root", "pivot": [0, 24, 0], "cubes": [{"origin": [-4, 12, -2], "size": [8, 12, 4], "uv": [16, 16]}]},
                {"name": "head", "parent": "body", "pivot": [0, 24, 0], "cubes": [{"origin": [-4, 24, -4], "size": [8, 8, 8], "uv": [0, 0], "inflate": 1.5}]},
                {"name": "rightArm", "parent": "body", "pivot": [-5, 22, 0], "cubes": [{"origin": [-8, 12, -2], "size": [4, 12, 4], "uv": [40, 16]}]},
                {"name": "pickaxe", "parent": "rightArm", "pivot": [-6, 13, 0], "cubes": [
                    {"origin": [-6.5, 12.5, -10], "size": [1, 1, 8], "uv": [32, 0]},
                    {"origin": [-6.5, 9.5, -11], "size": [1, 7, 1], "uv": [52, 0]}]},
                {"name": "leftArm", "parent": "body", "pivot": [5, 22, 0], "cubes": [{"origin": [4, 12, -2], "size": [4, 12, 4], "uv": [32, 48]}]},
                {"name": "rightLeg", "parent": "root", "pivot": [-1.9, 12, 0], "cubes": [{"origin": [-3.9, 0, -2], "size": [4, 12, 4], "uv": [0, 16]}]},
                {"name": "leftLeg", "parent": "root", "pivot": [1.9, 12, 0], "cubes": [{"origin": [-0.1, 0, -2], "size": [4, 12, 4], "uv": [16, 48]}]},
            ],
        }],
    }
    with open(os.path.join(RP, "models", "entity", "eco_minion.geo.json"), "w") as f:
        json.dump(geo, f, indent=2)

    # --- display block model: a 16x16x16 cube, each face uses the whole texture ---
    face = {"uv": [0, 0], "uv_size": [16, 16]}
    block_geo = {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {"identifier": "geometry.eco_minion_block", "texture_width": 16, "texture_height": 16,
                            "visible_bounds_width": 2, "visible_bounds_height": 2, "visible_bounds_offset": [0, 0.5, 0]},
            "bones": [{"name": "block", "pivot": [0, 0, 0], "cubes": [{
                "origin": [-8, 0, -8], "size": [16, 16, 16],
                "uv": {k: dict(face) for k in ("north", "south", "east", "west", "up", "down")}}]}],
        }],
    }
    with open(os.path.join(RP, "models", "entity", "eco_minion_block.geo.json"), "w") as f:
        json.dump(block_geo, f, indent=2)

    # --- mining animation ---
    anim = {
        "format_version": "1.8.0",
        "animations": {
            "animation.eco_minion.mine": {
                "loop": True, "animation_length": 0.8,
                "bones": {
                    "rightArm": {"rotation": {"0.0": [-110, 0, 0], "0.3": [-25, 0, 0], "0.8": [-110, 0, 0]}},
                    "body": {"rotation": {"0.0": [0, 0, 0], "0.3": [6, 0, 0], "0.8": [0, 0, 0]}},
                    "head": {"rotation": {"0.0": [0, 0, 0], "0.3": [8, 0, 0], "0.8": [0, 0, 0]}},
                },
            },
        },
    }
    with open(os.path.join(RP, "animations", "eco_minion.animation.json"), "w") as f:
        json.dump(anim, f, indent=2)

    # --- client entities ---
    client = {
        "format_version": "1.10.0",
        "minecraft:client_entity": {"description": {
            "identifier": "eco:minion",
            "materials": {"default": "entity_alphatest"},
            "textures": {f"s{i}": f"textures/entity/eco_minion_{mt['id']}" for i, mt in enumerate(MINION_TYPES)},
            "geometry": {"default": "geometry.eco_minion"},
            "animations": {"mine": "animation.eco_minion.mine"},
            "scripts": {"animate": ["mine"]},
            "render_controllers": ["controller.render.eco_minion"],
        }},
    }
    with open(os.path.join(ent_dir, "eco_minion.entity.json"), "w") as f:
        json.dump(client, f, indent=2)
    block_client = {
        "format_version": "1.10.0",
        "minecraft:client_entity": {"description": {
            "identifier": "eco:minion_block",
            "materials": {"default": "entity"},
            "textures": {f"t{i}": t for i, t in enumerate(DISPLAY_TEXTURES)},
            "geometry": {"default": "geometry.eco_minion_block"},
            "render_controllers": ["controller.render.eco_minion_block"],
        }},
    }
    with open(os.path.join(ent_dir, "eco_minion_block.entity.json"), "w") as f:
        json.dump(block_client, f, indent=2)
    rc = {
        "format_version": "1.8.0",
        "render_controllers": {
            "controller.render.eco_minion_block": {
                "arrays": {"textures": {"Array.tiers": [f"Texture.t{i}" for i in range(len(DISPLAY_TEXTURES))]}},
                "geometry": "Geometry.default",
                "materials": [{"*": "Material.default"}],
                "textures": ["Array.tiers[query.variant]"],
            },
            "controller.render.eco_minion": {
                "arrays": {"textures": {"Array.skins": [f"Texture.s{i}" for i in range(len(MINION_TYPES))]}},
                "geometry": "Geometry.default",
                "materials": [{"*": "Material.default"}],
                "textures": ["Array.skins[query.variant]"],
            },
        },
    }
    with open(os.path.join(RP, "render_controllers", "eco_minion_block.render_controllers.json"), "w") as f:
        json.dump(rc, f, indent=2)

    # --- behaviour entities ---
    common = {
        "minecraft:health": {"value": 1000, "max": 1000},
        "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
        "minecraft:physics": {"has_gravity": False, "has_collision": True},
        "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
        "minecraft:knockback_resistance": {"value": 1.0},
        "minecraft:persistent": {},
        "minecraft:fire_immune": {},
        "minecraft:interact": {"interactions": [{
            "on_interact": {"filters": {"all_of": [{"test": "is_family", "subject": "other", "value": "player"}]}},
            "interact_text": "action.interact.eco_minion"}]},
    }
    ns = len(MINION_TYPES)
    minion = {
        "format_version": "1.21.0",
        "minecraft:entity": {
            "description": {"identifier": "eco:minion", "is_spawnable": False, "is_summonable": True},
            "component_groups": {f"eco:skin_{i}": {"minecraft:variant": {"value": i}} for i in range(ns)},
            "events": {f"eco:set_skin_{i}": {"add": {"component_groups": [f"eco:skin_{i}"]},
                                             "remove": {"component_groups": [f"eco:skin_{j}" for j in range(ns) if j != i]}}
                       for i in range(ns)},
            "components": {
                "minecraft:variant": {"value": 0},
                **common,
                "minecraft:type_family": {"family": ["eco_minion", "inanimate"]},
                "minecraft:collision_box": {"width": 0.5, "height": 1.0},
                "minecraft:scale": {"value": 0.55},
                "minecraft:nameable": {"always_show": True, "allow_name_tag_renaming": False},
            },
        },
    }
    with open(os.path.join(BP, "entities", "eco_minion.json"), "w") as f:
        json.dump(minion, f, indent=2)
    n = len(DISPLAY_TEXTURES)
    groups = {f"eco:tier_{i}": {"minecraft:variant": {"value": i}} for i in range(n)}
    events = {f"eco:set_tier_{i}": {"add": {"component_groups": [f"eco:tier_{i}"]},
                                    "remove": {"component_groups": [f"eco:tier_{j}" for j in range(n) if j != i]}}
              for i in range(n)}
    block_ent = {
        "format_version": "1.21.0",
        "minecraft:entity": {
            "description": {"identifier": "eco:minion_block", "is_spawnable": False, "is_summonable": True},
            "component_groups": groups,
            "events": events,
            "components": {
                **common,
                "minecraft:type_family": {"family": ["eco_minion_block", "inanimate"]},
                "minecraft:collision_box": {"width": 1.0, "height": 1.0},
                "minecraft:variant": {"value": 0},
            },
        },
    }
    with open(os.path.join(BP, "entities", "eco_minion_block.json"), "w") as f:
        json.dump(block_ent, f, indent=2)

    # --- the minion item (16x16 icon: minion head) ---
    icon = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    ip = icon.load()
    art = [
        "................",
        "....kkkkkkkk....",
        "...kyyyyyyyyk...",
        "..kyyyywwyyyyk..",
        "..kYYYYYYYYYYk..",
        "..kssssssssssk..",
        "..kssssssssssk..",
        "..kswbsssswbsk..",
        "..kssssssssssk..",
        "..ksssssrrsssk..",
        "..kssssssssssk..",
        "..kkkkkkkkkkkk..",
        "...kbbbbbbbbk...",
        "...kbbnnnnbbk...",
        "...kbbbbbbbbk...",
        "...kkkkkkkkkk...",
    ]
    cols = {"k": hexc("#161616"), "y": hexc("#f2c12e"), "Y": hexc("#c98d12"), "w": hexc("#ffffff"),
            "s": hexc("#e8b07a"), "b": hexc("#3f6fd1"), "n": hexc("#8a5a2b"), "r": hexc("#c98f5a")}
    for y, row in enumerate(art):
        for x, ch in enumerate(row):
            if ch in cols:
                ip[x, y] = cols[ch]
    save(icon, os.path.join(RP, "textures", "items", "eco_mining_minion.png"))
    save(icon, os.path.join(UI, "icon_minion.png"), scale=4)
    tex_path = os.path.join(RP, "textures", "item_texture.json")
    data = json.load(open(tex_path))
    data["texture_data"]["eco_mining_minion"] = {"textures": "textures/items/eco_mining_minion"}
    with open(tex_path, "w") as f:
        json.dump(data, f, indent=2)
    item = {
        "format_version": "1.21.60",
        "minecraft:item": {
            "description": {"identifier": "eco:mining_minion", "menu_category": {"category": "items"}},
            "components": {
                "minecraft:icon": "eco_mining_minion",
                "minecraft:display_name": {"value": "§r§eMining Minion"},
                "minecraft:max_stack_size": 1,
                "minecraft:glint": True,
            },
        },
    }
    with open(os.path.join(BP, "items", "mining_minion.json"), "w") as f:
        json.dump(item, f, indent=2)
    for lang in ("en_US", "en_GB"):
        with open(os.path.join(RP, "texts", lang + ".lang"), "a") as f:
            f.write("item.eco:mining_minion=Mining Minion\n")
            f.write("entity.eco:minion.name=Mining Minion\n")
            f.write("entity.eco:minion_block.name=Minion Block\n")
            f.write("action.interact.eco_minion=Open Minion\n")


# Enchanted minion loot: one item per minion drop (see MINION_TYPES)
MINION_LOOT = {}
for _mt in MINION_TYPES:
    for (_name, _base, _c, _v, _cost, _disp, _icon) in _mt["tiers"]:
        MINION_LOOT[_base] = (" ".join(w.capitalize() for w in _base.split("_")) if _base not in ("mob_spawner", "dragon_breath") else {"mob_spawner": "Spawner", "dragon_breath": "Dragon's Breath"}[_base], _icon)


def make_minion_loot():
    item_dir = os.path.join(BP, "items", "minion_loot")
    os.makedirs(item_dir, exist_ok=True)
    tex_path = os.path.join(RP, "textures", "item_texture.json")
    data = json.load(open(tex_path))
    lang = []
    for base, (name, tex) in MINION_LOOT.items():
        data["texture_data"][f"eco_mloot_{base}"] = {"textures": tex}
        item = {
            "format_version": "1.21.60",
            "minecraft:item": {
                "description": {"identifier": f"eco:mloot_{base}", "menu_category": {"category": "items"}},
                "components": {
                    "minecraft:icon": f"eco_mloot_{base}",
                    "minecraft:display_name": {"value": f"§r§bEnchanted {name}"},
                    "minecraft:max_stack_size": 64,
                    "minecraft:glint": True,
                },
            },
        }
        with open(os.path.join(item_dir, f"mloot_{base}.json"), "w") as f:
            json.dump(item, f, indent=2, ensure_ascii=False)
        lang.append(f"item.eco:mloot_{base}=Enchanted {name}\n")
    with open(tex_path, "w") as f:
        json.dump(data, f, indent=2)
    for l in ("en_US", "en_GB"):
        with open(os.path.join(RP, "texts", l + ".lang"), "a") as f:
            f.writelines(lang)


if __name__ == "__main__":
    make_shapes()
    make_frames()
    make_icons()
    make_badges()
    make_close()
    make_pack_icons()
    make_structures()
    make_heads()
    make_enchanted_crops()
    make_minions()
    make_minion_loot()
    print("Assets generated.")
