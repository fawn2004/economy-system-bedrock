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
        "SpawnCount": (T.SHORT, 4),
        "MaxNearbyEntities": (T.SHORT, 6),
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


# Keep in sync with the "spawners" category in scripts/config.js
SPAWNER_MOBS = ["pig", "cow", "chicken", "sheep", "zombie", "skeleton",
                "spider", "creeper", "blaze", "iron_golem", "enderman", "witch"]


def make_structures():
    out = os.path.join(BP, "structures", "eco")
    os.makedirs(out, exist_ok=True)
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


if __name__ == "__main__":
    make_shapes()
    make_frames()
    make_icons()
    make_badges()
    make_close()
    make_pack_icons()
    make_structures()
    print("Assets generated.")
