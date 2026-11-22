#!/usr/bin/env python3
"""Textures for the chest-style menus (textures/ui/eco/chest_*). Needs Pillow."""
import json, os
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "packs", "SkyblockEconomy_RP", "textures", "ui", "eco")


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def save(img, name, nineslice=None):
    img.save(os.path.join(OUT, name + ".png"))
    if nineslice:
        with open(os.path.join(OUT, name + ".json"), "w") as f:
            json.dump({"nineslice_size": nineslice, "base_size": list(img.size)}, f, indent=2)


def chest_bg():
    # vanilla container: rounded black outline, white top-left bevel, grey bottom-right bevel
    s = 16
    img = Image.new("RGBA", (s, s), hexc("#C6C6C6"))
    px = img.load()
    for i in range(s):
        for j in range(s):
            edge = i == 0 or j == 0 or i == s - 1 or j == s - 1
            if edge:
                px[i, j] = hexc("#000000")
    for c in [(0, 0), (s - 1, 0), (0, s - 1), (s - 1, s - 1)]:
        px[c] = (0, 0, 0, 0)
    for k in range(1, s - 2):
        px[k, 1] = hexc("#FFFFFF"); px[k, 2] = hexc("#FFFFFF")
        px[1, k] = hexc("#FFFFFF"); px[2, k] = hexc("#FFFFFF")
    for k in range(3, s - 1):
        px[k, s - 2] = hexc("#555555"); px[k, s - 3] = hexc("#555555")
        px[s - 2, k] = hexc("#555555"); px[s - 3, k] = hexc("#555555")
    px[1, 1] = hexc("#000000")
    px[s - 2, s - 2] = hexc("#000000")
    save(img, "chest_bg", 4)


def slot():
    img = Image.new("RGBA", (18, 18), hexc("#8B8B8B"))
    px = img.load()
    for k in range(18):
        px[k, 0] = hexc("#373737"); px[0, k] = hexc("#373737")
        px[k, 17] = hexc("#FFFFFF"); px[17, k] = hexc("#FFFFFF")
    px[17, 0] = hexc("#8B8B8B"); px[0, 17] = hexc("#8B8B8B")
    save(img, "chest_slot")
    hl = Image.new("RGBA", (18, 18), (0, 0, 0, 0))
    hp = hl.load()
    for i in range(1, 17):
        for j in range(1, 17):
            hp[i, j] = (255, 255, 255, 128)
    save(hl, "chest_slot_hover")


def tooltip():
    # vanilla item tooltip: near-black purple fill, purple gradient border
    s = 16
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    px = img.load()
    fill = (16, 0, 16, 240)
    for i in range(1, s - 1):
        for j in range(s):
            px[i, j] = fill
    for j in range(1, s - 1):
        px[0, j] = fill; px[s - 1, j] = fill
    for k in range(1, s - 1):
        top = hexc("#5000FF", 200)
        bot = hexc("#28007F", 200)
        px[k, 1] = top; px[k, s - 2] = bot
        t = (k - 1) / (s - 3)
        mid = tuple(int(top[c] * (1 - t) + bot[c] * t) for c in range(4))
        px[1, k] = mid; px[s - 2, k] = mid
    save(img, "chest_tooltip", 3)


def sidebar_bg():
    # grey panel with a coloured (gold) border, for the scoreboard sidebar
    s = 12
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    px = img.load()
    border = hexc("#FFAA00")
    inner = hexc("#7A4F00")
    fill = (48, 48, 48, 215)
    for i in range(s):
        for j in range(s):
            if i == 0 or j == 0 or i == s - 1 or j == s - 1:
                px[i, j] = border
            elif i == 1 or j == 1 or i == s - 2 or j == s - 2:
                px[i, j] = inner
            else:
                px[i, j] = fill
    for c in [(0, 0), (s - 1, 0), (0, s - 1), (s - 1, s - 1)]:
        px[c] = (0, 0, 0, 0)
    save(img, "sidebar_bg", 3)
    head = Image.new("RGBA", (4, 4), (0, 0, 0, 90))
    save(head, "sidebar_head")


if __name__ == "__main__":
    sidebar_bg()
    chest_bg()
    slot()
    tooltip()
    print("chest UI textures written")
