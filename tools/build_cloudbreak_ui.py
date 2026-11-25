"""Builds Cloudbreak UI textures into packs/Cloudbreak_RP/textures/ui/cb:
icons (from the Icon Set designs), two extra menu header themes (cyan, pink)
and the Core Monitor sidebar panel.   python3 tools/build_cloudbreak_ui.py
"""
import json
import os

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "packs", "Cloudbreak_RP", "textures", "ui", "cb")
ECO = os.path.join(ROOT, "packs", "Cloudbreak_RP", "textures", "ui", "eco")


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


ICONS = {
    "home": ("#4FD1E8", ["...##...", "..####..", ".######.", "########", ".#....#.", ".#.##.#.", ".#.##.#.", ".######."]),
    "raids": ("#FF5A4E", ["#......#", ".#....#.", "..#..#..", "...##...", "...##...", "..#..#..", "##....##", "##....##"]),
    "bank": ("#F2C14E", ["..####..", ".######.", "..####..", ".######.", "..####..", ".######.", "..####..", ".######."]),
    "shop": ("#F2C14E", ["...##...", "..#..#..", ".#....#.", "########", "#.#..#.#", "#.#..#.#", ".#.##.#.", "..####.."]),
    "insurance": ("#3DDC97", ["########", "#......#", "#..##..#", "#.####.#", "#..##..#", ".#....#.", "..#..#..", "...##..."]),
    "broken": ("#FF7A6B", ["####.###", "#...#..#", "#..#...#", "#...#..#", "#..#...#", ".#..#.#.", "..#.##..", "...##..."]),
    "members": ("#A78BFA", ["...##...", "..####..", "..####..", "...##...", ".######.", "########", "########", "########"]),
    "raidlog": ("#F2A93B", [".######.", "#......#", "#.####.#", "#......#", "#.###..#", "#......#", "#.####.#", ".######."]),
    "leaderboards": ("#F2C14E", ["########", "#.####.#", "#.####.#", ".######.", "..####..", "...##...", "..####..", ".######."]),
    "settings": ("#8E9BB5", ["..#..#..", ".######.", "###..###", ".#....#.", ".#....#.", "###..###", ".######.", "..#..#.."]),
    "core": ("#4FD1E8", ["...##...", "..#ww#..", ".##..##.", "##.##.##", "##.##.##", ".##..##.", "..####..", "...##..."]),
    "size": ("#4FD1E8", ["###..###", "##....##", "#.#..#.#", "........", "........", "#.#..#.#", "##....##", "###..###"]),
    "sell": ("#F2C14E", ["..####..", ".#....#.", "#..##..#", "#.#....#", "#..##..#", "#....#.#", ".#.##.#.", "..####.."]),
    "fly": ("#E6EDF7", ["......##", ".....###", "....###.", "...###..", "..###...", ".###....", ".##.....", "#......."]),
    "ore": ("#F2A93B", ["....##..", "...##...", "..##....", ".######.", "....##..", "...##...", "..##....", ".#......"]),
    "spawners": ("#A78BFA", ["########", "#.#.#.##", "##.#.#.#", "#.#.#.##", "##.#.#.#", "#.#.#.##", "##.#.#.#", "########"]),
    "crops": ("#3DDC97", ["...#....", "..###...", "...#.#..", ".#.#.##.", "..##.#..", "...##...", "...#....", "########"]),
    "clock": ("#3DDC97", ["..####..", ".#....#.", "#...#..#", "#...#..#", "#...##.#", "#......#", ".#....#.", "..####.."]),
    "intel": ("#F2A93B", ["........", "..####..", ".#....#.", "#..ww..#", "#..ww..#", ".#....#.", "..####..", "........"]),
    "skull": ("#FF7A6B", [".######.", "########", "#..##..#", "#..##..#", "########", ".##..##.", ".######.", ".#.##.#."]),
    "crown": ("#3DDC97", ["........", "#..##..#", "##.##.##", "########", "########", "#.#..#.#", "########", "........"]),
    "heart": ("#FF5A4E", [".##.##..", "#######.", "#######.", "#######.", ".#####..", "..###...", "...#....", "........"]),
    "key": ("#F2C14E", ["........", "........", ".###....", "#...#...", "#...####", "#...#.##", ".###....", "........"]),
    "bridging": ("#9A9A9A", ["......##", "......##", "....####", "....####", "..######", "..######", "########", "########"]),
    "banner": ("#A78BFA", ["bbbbbbbb", "bbbbbbbb", "bbbwwbbb", "bbwwwwbb", "bbbwwbbb", "bbbbbbbb", "bbb..bbb", "bb....bb"]),
    "admin": ("#FF7AC6", ["..#..#..", ".######.", "###..###", ".#....#.", ".#....#.", "###..###", ".######.", "..#..#.."]),
    "reset": ("#FF7A6B", ["..####..", ".#....##", "#....###", "#.......", "#.......", "#......#", ".#....#.", "..####.."]),
    "stop": ("#FF7A6B", ["..####..", ".######.", "##.##.##", "###..###", "###..###", "##.##.##", ".######.", "..####.."]),
    "bin": ("#FF7A6B", [".######.", "########", ".#.##.#.", ".#.##.#.", ".#.##.#.", ".#.##.#.", ".######.", "........"]),
    "star": ("#A78BFA", ["...##...", "...##...", "########", ".######.", "..####..", ".##..##.", "##....##", "........"]),
    "chest": ("#C08A55", ["########", "#......#", "#......#", "########", "#..##..#", "#......#", "#......#", "########"]),
    "lock": ("#6B7689", ["..####..", ".#....#.", ".#....#.", "########", "###..###", "###..###", "########", "########"]),
    "back": ("#B8C2D1", ["...#....", "..##....", ".#######", "########", ".#######", "..##....", "...#....", "........"]),
    "yes": ("#3DDC97", [".......#", "......##", ".....##.", "#...##..", "##.##...", ".###....", "..#.....", "........"]),
    "no": ("#FF7A6B", ["#......#", "##....##", ".##..##.", "..####..", "..####..", ".##..##.", "##....##", "#......#"]),
}


def make_icons():
    for name, (col, rows) in ICONS.items():
        img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        px = img.load()
        base, white = hexc(col), hexc("#F3EEE2")
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                c = {"#": base, "b": base, "w": white}.get(ch)
                if not c:
                    continue
                for dx in range(4):
                    for dy in range(4):
                        px[x * 4 + dx, y * 4 + dy] = c
        img.save(os.path.join(OUT, f"icon_{name}.png"))


# ---------------------------------------------------------------------------
# Full-colour 16x16 pixel art: Generators / Ores icon, Ore Generator icon and
# the Island Core block. "." is see-through; every other letter is a colour.
# ---------------------------------------------------------------------------
BLOCKS = os.path.join(ROOT, "packs", "Cloudbreak_RP", "textures", "blocks", "cb")

ART = {
    "generator": ({
        "k": "#1B1B22", "L": "#FF7A1A", "l": "#FFC23A", "r": "#C8361A",
        "W": "#3F76E4", "w": "#7FB0FF", "d": "#2A4FA8",
        "C": "#8A8A8A", "c": "#5E5E5E", "h": "#B5B5B5", "D": "#5FE8E0", "G": "#F2C14E",
    }, [
        "kkkk........kkkk",
        "klLk........kwWk",
        "kLlk........kWwk",
        "kLLk........kWWk",
        "klLk........kwWk",
        "kLLkkkkkkkkkkWWk",
        "kLlkhhCChCCckWwk",
        "kLLkhCCcCChckWWk",
        "klLkCCcCDDCckwWk",
        "kLLkCcCCDDcCkWWk",
        "kLlkhCCcCCCckWwk",
        "kLLkCCGGCcCckWWk",
        "krLkcCGGCCcckdWk",
        "krrkccCcccCckddk",
        "rrrkcccccccckddd",
        "kkkkkkkkkkkkkkkk",
    ]),
    "ore": ({
        "k": "#1B1B22", "S": "#8C8C8C", "s": "#6E6E6E", "t": "#A8A8A8",
        "D": "#5FE8E0", "d": "#2BB3AB", "E": "#3DDC5A", "e": "#1E9A3A",
        "G": "#F2C14E", "g": "#C08A20", "R": "#FF3B3B", "r": "#A81E1E",
    }, [
        "kkkkkkkkkkkkkkkk",
        "ktttSSStSSStSSsk",
        "ktDDSSsSSGGSSssk",
        "kSDdDSSSGgGgSSsk",
        "kSSddSSSSGgSSSsk",
        "kSsSSSStSSSSRRsk",
        "ktSSSsSSSSSRrRsk",
        "kSSSEESSssSSRrSk",
        "kSSEeEESSSSSSSsk",
        "ksSSEeSSSDDSSSsk",
        "kSSSSSSSDdDdSSsk",
        "kSGGSSsSSddSSSsk",
        "kSGgGSSSSSSRRSsk",
        "kSSgSSsSSSSRrSsk",
        "kssssssssssssssk",
        "kkkkkkkkkkkkkkkk",
    ]),
}

CORE_PAL = {
    "F": "#2A3350", "f": "#1A2036", "h": "#3E4A70", "n": "#111728",
    "b": "#1F8FA8", "c": "#4FD1E8", "C": "#A8F2FF", "w": "#F3FFFF",
}
CORE_SIDE = [
    "hhhhhhhhhhhhhhhF",
    "hFFFFFFFFFFFFFFf",
    "hFnnnnnnnnnnnnFf",
    "hFnnnnnbbnnnnnFf",
    "hFnnnnbccbnnnnFf",
    "hFnnnbcCCcbnnnFf",
    "hFnnbcCwwCcbnnFf",
    "hFnbcCwwwwCcbnFf",
    "hFnbcCwwwwCcbnFf",
    "hFnnbcCwwCcbnnFf",
    "hFnnnbcCCcbnnnFf",
    "hFnnnnbccbnnnnFf",
    "hFnnnnnbbnnnnnFf",
    "hFnnnnnnnnnnnnFf",
    "hFFFFFFFFFFFFFFf",
    "Ffffffffffffffff",
]
CORE_TOP = [
    "hhhhhhhhhhhhhhhF",
    "hFFFFFFFFFFFFFFf",
    "hFnnnnnnnnnnnnFf",
    "hFnnnbbbbbbnnnFf",
    "hFnnbccccccbnnFf",
    "hFnbcCnnnnCcbnFf",
    "hFnbcnnwwnncbnFf",
    "hFnbcnwCCwncbnFf",
    "hFnbcnwCCwncbnFf",
    "hFnbcnnwwnncbnFf",
    "hFnbcCnnnnCcbnFf",
    "hFnnbccccccbnnFf",
    "hFnnnbbbbbbnnnFf",
    "hFnnnnnnnnnnnnFf",
    "hFFFFFFFFFFFFFFf",
    "Ffffffffffffffff",
]


def paint(pal, rows, scale):
    assert len(rows) == 16 and all(len(r) == 16 for r in rows), rows
    img = Image.new("RGBA", (16 * scale, 16 * scale), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            c = hexc(pal[ch])
            for dx in range(scale):
                for dy in range(scale):
                    px[x * scale + dx, y * scale + dy] = c
    return img


def make_art():
    for name, (pal, rows) in ART.items():
        paint(pal, rows, 2).save(os.path.join(OUT, f"icon_{name}.png"))
    os.makedirs(BLOCKS, exist_ok=True)
    paint(CORE_PAL, CORE_SIDE, 1).save(os.path.join(BLOCKS, "island_core.png"))
    paint(CORE_PAL, CORE_TOP, 1).save(os.path.join(BLOCKS, "island_core_top.png"))


# ---------------------------------------------------------------------------
# Core Terminal screen (ui/cb_terminal.json): panels, cards, tabs, the deposit
# button, shield badges and the big core picture. Colours from the mockup.
# ---------------------------------------------------------------------------
def box(name, fill, border, width=2, bottom=None, size=16):
    img = Image.new("RGBA", (size, size), hexc(fill) if isinstance(fill, str) else fill)
    px = img.load()
    for i in range(size):
        for w in range(width):
            for c in ((i, w), (i, size - 1 - w), (w, i), (size - 1 - w, i)):
                px[c] = hexc(border)
    if bottom:
        for i in range(width, size - width):
            for w in range(width, width + 2):
                px[i, size - 1 - w] = hexc(bottom)
    img.save(os.path.join(OUT, f"{name}.png"))
    with open(os.path.join(OUT, f"{name}.json"), "w") as f:
        json.dump({"nineslice_size": width + (2 if bottom else 1), "base_size": [size, size]}, f)


def make_terminal():
    box("term_bg", hexc("#0B1020", 245), "#26324D", 1)
    box("term_box", "#141B2D", "#26324D")
    box("term_card", "#141B2D", "#26324D")
    box("term_card_hover", "#18213A", "#4FD1E8")
    box("term_tab", "#141B2D", "#26324D")
    box("term_tab_hover", "#18213A", "#4FD1E8")
    box("term_tab_on", "#1A2440", "#FFFFFF")
    box("term_deposit", "#F2C14E", "#F2C14E", 1, bottom="#B8862E")
    box("term_deposit_hover", "#FFD66B", "#FFD66B", 1, bottom="#C99A3A")
    box("term_chip_on", "#0F2A24", "#3DDC97", 1)
    box("term_chip_off", "#2A0F0F", "#FF5A4E", 1)
    # the little cyan square next to "CORE TERMINAL"
    sq = Image.new("RGBA", (10, 10), hexc("#4FD1E8"))
    sp = sq.load()
    for i in range(10):
        for c in ((i, 0), (i, 9), (0, i), (9, i)):
            sp[c] = hexc("#4FD1E8")
    for x in range(2, 8):
        for y in range(2, 8):
            sp[x, y] = hexc("#0B1020") if x in (2, 7) or y in (2, 7) else hexc("#4FD1E8")
    sq.save(os.path.join(OUT, "term_square.png"))
    # the core: a diamond ring inside a dark screen, a bright gem in the middle
    n = 48
    core = Image.new("RGBA", (n, n), hexc("#0B1020"))
    cp = core.load()
    c = (n - 1) / 2
    for x in range(n):
        for y in range(n):
            if x in (0, n - 1) or y in (0, n - 1):
                cp[x, y] = hexc("#26324D")
                continue
            d = abs(x - c) + abs(y - c)
            if d <= 6:
                cp[x, y] = hexc("#4FD1E8")
            elif d <= 8:
                cp[x, y] = hexc("#9BE7F4")
            elif d <= 16:
                cp[x, y] = hexc("#10263A")
            elif d <= 19:
                cp[x, y] = hexc("#4FD1E8")
            elif d <= 20:
                cp[x, y] = hexc("#0B1020")
            elif d <= 21:
                cp[x, y] = hexc("#1F5566")
    core.save(os.path.join(OUT, "term_core.png"))


def recolor_header(src_name, dst_name, target):
    """Copies an eco header texture and tints it to a new colour (keeps shading)."""
    src = Image.open(os.path.join(ECO, f"{src_name}.png")).convert("RGBA")
    t = hexc(target)
    out = Image.new("RGBA", src.size)
    sp, op = src.load(), out.load()
    for x in range(src.width):
        for y in range(src.height):
            r, g, b, a = sp[x, y]
            lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            k = min(1.6, lum / 0.55)
            op[x, y] = (min(255, int(t[0] * k)), min(255, int(t[1] * k)), min(255, int(t[2] * k)), a)
    out.save(os.path.join(ECO, f"{dst_name}.png"))
    j = os.path.join(ECO, f"{src_name}.json")
    if os.path.exists(j):
        with open(j) as f, open(os.path.join(ECO, f"{dst_name}.json"), "w") as g:
            g.write(f.read())


def make_sidebar_panel():
    """Core Monitor panel: dark navy with a cyan outline (9-slice)."""
    img = Image.new("RGBA", (8, 8), hexc("#0B1020", 225))
    px = img.load()
    for i in range(8):
        for j in (0, 7):
            px[i, j] = hexc("#4FD1E8")
            px[j, i] = hexc("#4FD1E8")
    img.save(os.path.join(OUT, "sidebar_panel.png"))
    with open(os.path.join(OUT, "sidebar_panel.json"), "w") as f:
        json.dump({"nineslice_size": 2, "base_size": [8, 8]}, f)
    raid = Image.new("RGBA", (8, 8), hexc("#1A0808", 225))
    rp = raid.load()
    for i in range(8):
        for j in (0, 7):
            rp[i, j] = hexc("#FF5A4E")
            rp[j, i] = hexc("#FF5A4E")
    raid.save(os.path.join(OUT, "sidebar_panel_raid.png"))
    with open(os.path.join(OUT, "sidebar_panel_raid.json"), "w") as f:
        json.dump({"nineslice_size": 2, "base_size": [8, 8]}, f)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    make_icons()
    make_terminal()
    make_art()  # after make_icons: replaces the plain ore icon
    recolor_header("header_blue", "header_cyan", "#2FB8D0")
    recolor_header("header_blue", "header_pink", "#E8559F")
    make_sidebar_panel()
    print(f"Built {len(ICONS)} icons, 2 header themes and the sidebar panels.")
