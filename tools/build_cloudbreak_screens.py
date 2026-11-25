"""Builds every Cloudbreak menu screen from the chosen mockups:
  ui/cb_screens.json  + textures/ui/cb/s/*
   python3 tools/build_cloudbreak_screens.py            (build)
   python3 tools/build_cloudbreak_screens.py preview F  (draw previews from sample forms F.json)
Rects are in the pixels of the 1100 x 619 mockup pictures (see cb_screen_kit).
Each screen's marker code must match SCREEN_CODES in scripts/screens.js.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from cb_screen_kit import RP, F, Face, Img, R, Screen, Text, art, box, preview, write_textures, write_ui  # noqa: E402

TEN = "MinecraftTen"
CB = "textures/ui/cb/icon_"
COL = {"RED": "#FF5A4E", "GOLD": "#F2C14E", "CYAN": "#4FD1E8", "GREEN": "#3DDC97", "PURPLE": "#A78BFA",
       "GREY": "#8E9BB5", "PINK": "#FF7AC6", "ORANGE": "#F2A93B", "TEAL": "#2FB8A8", "BLUE": "#5B8DEF"}


def rel(rect, origin):
    """Canvas rect -> relative to an item at origin (both canvas units)."""
    return [round(rect[0] - origin[0], 1), round(rect[1] - origin[1], 1)] + rect[2:]


def sz(w, h):
    return (round(w * F, 1), round(h * F, 1))


# ---------------------------------------------------------------------------
# Pixel art
# ---------------------------------------------------------------------------
def head(name, hair, skin="#E8B07A", eye="#2A2A5A"):
    return art(name, [
        "HHHHHHHH", "HHHHHHHH", "HSSSSSSH", "SSSSSSSS", "SWESSEWS", "SSSSSSSS", "SSSMMSSS", "SSSSSSSS",
    ], {"H": hair, "S": skin, "W": "#FFFFFF", "E": eye, "M": "#9A5A3A"}, 2)


HEADS = [head(f"head_{i}", c) for i, c in enumerate(["#F2A93B", "#4FD1E8", "#3DDC97", "#A78BFA", "#FF5A4E", "#6B4A2A", "#E8E0C8"])]

LEVER_ON = art("lever_on", [
    "...........rr...", "..........rRr...", ".........wrr....", "........ww......", ".......ww.......", "......ww........",
    ".....ww.........", "....ww..........", "...ww...........", "................",
    "gggggggggggggggg", "GGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGG", "dddddddddddddddd",
], {"r": "#E0322A", "R": "#FF6A5A", "w": "#9A7040", "g": "#C8C8C8", "G": "#A8A8A8", "d": "#7A7A7A"}, 2)
LEVER_OFF = art("lever_off", [
    "..rr............", "..rRr...........", "...rrw..........", ".....ww.........", "......ww........", ".......ww.......",
    "........ww......", ".........ww.....", "..........ww....", "................",
    "gggggggggggggggg", "GGGGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGG", "dddddddddddddddd",
], {"r": "#6A2A26", "R": "#8A3A33", "w": "#6A5030", "g": "#9A9A9A", "G": "#808080", "d": "#5A5A5A"}, 2)


def safe(name, body, light, dark):
    return art(name, [
        "LLLLLLLLLLLLLLLL", "LBBBBBBBBBBBBBBD", "LBBBBkkkkkkBBBBD", "LBBBkkooookkBBBD", "LBBkkooooookkBBD", "LBkkoookkooookBD",
        "LBkoooowwoooookD", "LBkoooowwoooookD", "LBkoooowwoooookD", "LBkooookkooookBD", "LBBkkooooookkBBD", "LBBBkkooookkBBBD",
        "LBBBBkkkkkkBBBBD", "LBBBBBBBBBBBBBBD", "DDDDDDDDDDDDDDDD", "DDDDDDDDDDDDDDDD",
    ], {"L": light, "B": body, "D": dark, "k": dark, "o": "#121212", "w": "#F3EEE2"}, 2)


SAFES = {
    "basic": safe("safe_basic", "#A8A097", "#C8C0B7", "#6E6862"),
    "silver": safe("safe_silver", "#D5DCE6", "#F0F4F8", "#8A929E"),
    "gold": safe("safe_gold", "#F2C14E", "#FFE08A", "#B98F2A"),
    "diamond": safe("safe_diamond", "#2F8F86", "#4FB8AE", "#1E5F59"),
}
QBOX = art("qbox", [
    "DDDDDDDDDDDDDDDD", "DBBBBBBBBBBBBBBD", "DBBBBBBBBBBBBBBD", "DBBBBBOOOOBBBBBD", "DBBBBOOBBOOBBBBD", "DBBBBBBBBOOBBBBD",
    "DBBBBBBBOOBBBBBD", "DBBBBBBOOBBBBBBD", "DBBBBBBOOBBBBBBD", "DBBBBBBBBBBBBBBD", "DBBBBBBOOBBBBBBD", "DBBBBBBBBBBBBBBD",
    "DBBBBBBBBBBBBBBD", "DLLLLLLLLLLLLLLD", "DLLLLLLLLLLLLLLD", "DDDDDDDDDDDDDDDD",
], {"D": "#2A211C", "B": "#4A3A30", "L": "#33281F", "O": "#F2A93B"}, 2)
SHIELDS = art("shields5", [
    "RRR.RRR.RRR.RRR.GGG", "RBR.RBR.RBR.RBR.GgG", "RRR.RRR.RRR.RRR.GGG", ".R...R...R...R...G.",
], {"R": "#FF5A4E", "B": "#4A1A1A", "G": "#4A3A36", "g": "#2A2220"}, 4)


def banner(name, col):
    return art(name, [
        "CCCCCCCC", "CCCCCCCC", "CCCWWCCC", "CCWWWWCC", "CCCWWCCC", "CCCCCCCC", "CCC..CCC", "CC....CC",
    ], {"C": col, "W": "#F3EEE2"}, 2)


BANNERS = [banner(f"banner_{i}", c) for i, c in enumerate(
    ["#FF5A4E", "#4FD1E8", "#2A2440", "#E8D89A", "#3DDC97", "#9AA3B5", "#A78BFA", "#F2A93B", "#4FB8E8", "#6B4A2A"])]
ARROW_UP = art("arrow_up", ["...##...", "..####..", ".######.", "########", "..####..", "..####..", "..####..", "........"], {"#": "#3DDC97"}, 2)
ARROW_DOWN = art("arrow_down", ["........", "..####..", "..####..", "..####..", "########", ".######.", "..####..", "...##..."], {"#": "#FF5A4E"}, 2)
LOCK = art("lock_big", ["...####...", "..#....#..", "..#....#..", "##########", "####..####", "####..####", "##########", "##########"], {"#": "#4A5468"}, 3)
UNLOCK = art("unlock_big", ["...####...", "..#....#..", "..#.......", "##########", "####..####", "####..####", "##########", "##########"], {"#": "#FF7AC6"}, 3)
KEYS = {k: art(f"key_{k}", ["........", "........", ".###....", "#...#...", "#...####", "#...#.##", ".###....", "........"], {"#": c}, 2)
        for k, c in (("green", "#3DDC97"), ("pink", "#FF7AC6"), ("gold", "#F2C14E"), ("cyan", "#4FD1E8"), ("red", "#FF5A4E"))}


# ---------------------------------------------------------------------------
# Screens
# ---------------------------------------------------------------------------
def colour_states(fill, border_default=None, bw=1, bottom=False):
    """[(cRED, box), ...]: one colour state per entry of COL."""
    out = []
    for k, c in COL.items():
        if bottom:
            out.append((f"c{k}", box(c, None, bottom=shade(c))))
        else:
            out.append((f"c{k}", box(fill, c, bw)))
    return out


def shade(c, f=0.7):
    c = c.lstrip("#")
    return "#" + "".join(f"{int(int(c[i:i + 2], 16) * f):02X}" for i in (0, 2, 4))


def tower():
    s = Screen("tower", "0", bg="#0C0F14")
    s.box(R(28, 28, 318, 590), "#10141B", "#262E3C")
    s.box(R(36, 38, 40, 580), "#262E3C")
    it = sz(258, 50)
    s.zone("FL", R(52, 38, 312, 590), it, Face(box("#141A24", "#252D3B"), [("ON", box("#1A2030", "#FF5A4E"))], [
        Img([16, it[1] / 2 - 4, 8, 8]),
        Text([28, it[1] / 2, 55], 0.68, anchor="left_middle"),
        Img([it[0] - 7, it[1] / 2 - 1.5, 3, 3], box("#3A4150"), when="!ON"),
        Img([it[0] - 7, it[1] / 2 - 1.5, 3, 3], box("#FF5A4E"), when="ON"),
    ]), gap=2, click=True)
    s.zone("FN", R(52, 38, 312, 590), it, Face(parts=[Text([4, it[1] / 2, 12], 0.55, "#6B7689", anchor="left_middle")]), gap=2)
    s.zone("K", R(344, 30, 800, 46), (170, 6), Face(parts=[Text([0, 0, 170], 0.55, "#8E9BB5")]))
    s.zone("BANK", R(800, 28, 1040, 52), (87, 9), Face(parts=[Text([0, 0, 87], 0.72, align="right")]))
    pw = sz(728, 524)
    s.zone("P", R(344, 66, 1072, 590), pw, Face(box("#11151D", "#FF5A4E"), colour_states("#11151D"), [
        Text([11, 52, 240], 0.72, "#C9D1DD"),
    ]))
    s.zone("PN", R(372, 100, 440, 185), (25, 30), Face(parts=[Text([0, 0, 25], 3.0, font=TEN)]))
    s.text(R(455, 116, 600, 128) [:3], "F L O O R", scale=0.5, color="#8E9BB5")
    s.zone("PT", R(455, 135, 900, 175), (160, 14), Face(parts=[Text([0, 0, 160], 1.45, font=TEN)]))
    s.zone("PI", R(958, 101, 1041, 183), sz(83, 82), Face(box("#0C0F14", "#262E3C"), parts=[Img([5, 5, 20, 20])]))
    st = sz(215, 63)
    s.zone("ST", R(375, 435, 1045, 497), st, Face(box("#0F131B", "#262E3C"), parts=[Text([4, 4, st[0] - 8], 0.62, "#8E9BB5")]),
           orient="horizontal", gap=3.6)
    go = sz(182, 45)
    s.zone("GO", R(375, 515, 560, 562), go, Face(box(COL["RED"], bottom=shade(COL["RED"])), colour_states(None, bottom=True), [
        Text([0, go[1] / 2, go[0]], 0.72, "#1A0E0E", font=TEN, align="center", anchor="left_middle"),
    ]), click=True)
    return s


def members():
    s = Screen("members", "1", bg="#0C0F14")
    s.zone("K", R(28, 28, 500, 42), (170, 6), Face(parts=[Text([0, 0, 170], 0.55, "#8E9BB5")]))
    s.text(R(28, 50, 600, 80)[:3], "CHAIN OF COMMAND", scale=1.35, font=TEN)
    s.box(R(28, 95, 742, 590), "#121620", "#252D3B")
    for y, t in ((145, "OWNER"), (298, "CO-OWNER"), (423, "MEMBERS")):
        s.text(R(48, y, 200, y + 10)[:3], t, scale=0.5, color="#8E9BB5")
    line = "#3A4150"
    for r in (R(369, 197, 373, 267), R(369, 343, 373, 390), R(155, 388, 588, 392), R(155, 390, 159, 448), R(369, 390, 373, 448), R(584, 390, 588, 448)):
        s.box(r, line)
    card = sz(154, 76)
    face = Face(box("#0F1219", "#2A3140"), [("SEL", box("#141B28", "#4FD1E8", 1)), ("OWN", box("#0F1219", "#F2C14E"))], [
        Img([4, card[1] / 2 - 7.5, 15, 15]),
        Text([22, card[1] / 2, 33], 0.58, anchor="left_middle"),
    ])
    s.zone("OW", R(294, 121, 448, 197), card, face, click=True)
    s.zone("CO", R(12, 267, 730, 343), card, face, orient="horizontal", gap=6, align="top_middle", click=True)
    s.zone("ME", R(12, 448, 730, 524), card, face, orient="horizontal", gap=6, align="top_middle", click=True)
    s.box(R(764, 28, 1072, 242), "#121620", "#4FD1E8")
    s.text(R(782, 46, 900, 56)[:3], "S E L E C T E D", scale=0.5, color="#8E9BB5")
    s.zone("SA", R(782, 70, 1060, 130), sz(278, 60), Face(parts=[Img([0, 1, 19, 19]), Text([24, 11, 77], 0.6, anchor="left_middle")]))
    act = sz(132, 35)
    s.zone("ACT", R(782, 140, 1056, 176), act, Face(box("#252D3B", "#2E3748"), [
        ("cCYAN", box(COL["CYAN"], bottom="#2B8FA3")), ("cRED", box("#4A1A1A", "#4A1A1A")),
    ], [Text([0, act[1] / 2, act[0]], 0.6, "#FFFFFF", font=TEN, align="center", anchor="left_middle")]), orient="horizontal", gap=2.5, click=True)
    act2 = sz(271, 35)
    s.zone("ACT2", R(782, 188, 1056, 224), act2, Face(box("#252D3B", "#2E3748"), parts=[
        Text([0, act2[1] / 2, act2[0]], 0.6, "#FFFFFF", font=TEN, align="center", anchor="left_middle")]), click=True)
    s.box(R(764, 255, 1072, 590), "#121620", "#252D3B")
    s.text(R(780, 272, 1000, 282)[:3], "W H O   C A N   D O   W H A T", scale=0.5, color="#8E9BB5")
    for x, t, c in ((862, "OWNER", "#F2C14E"), (930, "CO", "#4FD1E8"), (990, "MEMBER", "#8E9BB5")):
        s.text(R(x, 294, x + 60, 302)[:3], t, scale=0.45, color=c)
    rows = [("Invite", 1, 1, 0), ("Kick", 1, 1, 0), ("Promote", 1, 1, 0), ("Buy raids", 1, 1, 0),
            ("Withdraw", 1, 1, 0), ("Transfer", 1, 0, 0), ("Deposit", 1, 1, 1)]
    for i, (name, a, b, c) in enumerate(rows):
        y = 318 + i * 27
        s.text(R(780, y - 5, 860, y + 5)[:3], name, scale=0.55, color="#C9D1DD")
        for x, on in ((876, a), (937, b), (998, c)):
            s.box(R(x, y - 4, x + 10, y + 6), "#3DDC97" if on else "#2A3140")
    return s


def bank():
    s = Screen("bank", "2", bg="#0E1117")
    s.box(R(28, 28, 250, 590), "#121620", "#252D3B")
    s.text(R(28, 46, 250, 56)[:3], "U P K E E P   C O V E R E D", scale=0.5, color="#8E9BB5", align="center")
    for y, t in ((72, "400h"), (185, "300h"), (297, "200h"), (409, "100h"), (521, "0h")):
        s.text(R(44, y, 80, y + 8)[:3], t, scale=0.45, color="#6B7689")
    bar = sz(139, 12)
    s.zone("CN", R(86, 168, 225, 536), bar, Face(box("#1E2430"), [("ON", box("#F2C14E", bottom="#B98F2A"))]), gap=1.5, align="bottom_left")
    s.zone("HR", R(40, 545, 240, 575), (73, 10), Face(parts=[Text([0, 0, 73], 1.0, "#3DDC97", font=TEN, align="center")]))
    s.img(R(272, 35, 302, 72), CB + "bank")
    s.zone("K", R(320, 28, 700, 42), (140, 6), Face(parts=[Text([0, 0, 140], 0.55, "#8E9BB5")]))
    s.text(R(320, 50, 700, 80)[:3], "CLAN BANK", scale=1.35, font=TEN)
    s.box(R(272, 96, 768, 230), "#121620", "#F2C14E")
    s.text(R(292, 117, 400, 127)[:3], "Balance", scale=0.6, color="#8E9BB5")
    s.zone("BAL", R(292, 135, 760, 190), (170, 20), Face(parts=[Text([0, 0, 170], 2.3, "#F2C14E", font=TEN)]))
    s.zone("TAX", R(292, 197, 760, 212), (170, 6), Face(parts=[Text([0, 0, 170], 0.6, "#C9D1DD")]))
    mode = sz(245, 40)
    s.zone("MODE", R(272, 245, 770, 285), mode, Face(box("#0F1219", "#2A3140"), [("ON", box("#F2C14E", bottom="#B98F2A"))], [
        Text([0, mode[1] / 2, mode[0]], 0.65, "#FFFFFF", font=TEN, align="center", anchor="left_middle")]), orient="horizontal", gap=2.4, click=True)
    amt = (28.3, round(40 * F, 1))
    s.zone("AMT", R(272, 299, 772, 340), amt, Face(box("#1A202C", "#1A202C"), [("ON", box("#3A2E12", "#F2C14E"))], [
        Text([0, amt[1] / 2, amt[0]], 0.62, "#FFFFFF", align="center", anchor="left_middle")]), orient="horizontal", gap=2.4, click=True)
    s.zone("MSG", R(272, 360, 768, 400), (180, 14), Face(parts=[Text([0, 0, 180], 0.62, align="center")]))
    s.box(R(272, 532, 768, 590), "#121620", "#252D3B")
    s.zone("CF", R(287, 553, 645, 572), (128, 7), Face(parts=[Text([0, 3.5, 128], 0.52, "#C9D1DD", anchor="left_middle")]))
    ok = sz(102, 35)
    s.zone("OK", R(651, 543, 753, 578), ok, Face(box("#3DDC97", bottom="#2A9C6B"), [("OFF", box("#2A3140"))], [
        Text([0, ok[1] / 2, ok[0]], 0.62, "#0E1A14", font=TEN, align="center", anchor="left_middle")]), click=True)
    s.box(R(790, 28, 1072, 590), "#121620", "#252D3B")
    s.text(R(806, 46, 1000, 60)[:3], "Ledger", scale=0.85, font=TEN)
    row = sz(250, 46)
    s.zone("LG", R(806, 75, 1056, 590), row, Face(box("#1A202C"), parts=[Img([3, row[1] / 2 - 4, 8, 8]), Text([14, row[1] / 2, 50], 0.5, anchor="left_middle")]), gap=1.8)
    s.zone("LA", R(806, 75, 1056, 590), row, Face(parts=[Text([40, row[1] / 2, row[0] - 43], 0.58, align="right", anchor="left_middle")]), gap=1.8)
    return s


def settings():
    s = Screen("settings", "3", bg="#0E1117")
    s.img(R(28, 36, 62, 70), CB + "settings")
    s.text(R(75, 30, 500, 40)[:3], "F L O O R  9  ·  O N L Y   Y O U   S E E   T H E S E", scale=0.5, color="#8E9BB5")
    s.text(R(75, 50, 500, 80)[:3], "SETTINGS", scale=1.35, font=TEN)
    s.text(R(800, 48, 1040, 60)[:3], "Pull a lever to switch it", scale=0.6, color="#8E9BB5", align="right")
    it = (186, 86)
    s.zone("SET", R(28, 100, 1080, 592), it, Face(box("#11151D", "#252D3B"), colour_states("#11151D"), [
        Img([9, 33, 19, 19], box("#0C0F14", "#252D3B")),
        Img([11.5, 35.5, 14, 14]),
        Text([37, 43, 105], 0.68, anchor="left_middle"),
        Img([150, 26, 26, 23], LEVER_ON, when="ON"),
        Img([150, 26, 26, 23], LEVER_OFF, when="!ON"),
    ]), grid=True, gap=4, click=True, cols=2, rows=2)
    s.close = True
    return s


def admin():
    s = Screen("admin", "4", bg="#0E1117")
    s.box(R(24, 28, 82, 52), COL["PINK"])
    s.text(R(24, 36, 82, 46)[:3], "ADMIN", scale=0.5, color="#2A0E1E", align="center", font=TEN)
    s.text(R(96, 30, 600, 60)[:3], "CONTROL ROOM", scale=1.35, font=TEN)
    pill = sz(100, 30)
    s.zone("PILL", R(680, 26, 1040, 56), pill, Face(box("#141A24", "#252D3B"), parts=[Text([0, pill[1] / 2, pill[0]], 0.55, align="center", anchor="left_middle")]),
           orient="horizontal", gap=2, align="top_right")
    s.box(R(24, 71, 229, 593), "#11151D", "#252D3B")
    s.text(R(36, 86, 200, 96)[:3], "P L A Y E R S", scale=0.5, color="#8E9BB5")
    sr = sz(182, 32)
    s.zone("SR", R(36, 102, 218, 134), sr, Face(box("#0C0F14", "#2A3140"), parts=[Text([4, sr[1] / 2, 60], 0.58, "#6B7689", anchor="left_middle")]), click=True)
    pl = sz(182, 42)
    s.zone("PL", R(36, 140, 222, 590), pl, Face(box("#141A24"), [("SEL", box("#1E1A28", COL["PINK"]))], [
        Img([3, pl[1] / 2 - 5, 10, 10]),
        Text([16, pl[1] / 2, 38], 0.55, anchor="left_middle"),
        Img([41, pl[1] / 2 - 3, 17, 6], box("#3A1830", COL["PINK"]), when="ADM"),
        Text([41, pl[1] / 2, 17], 0.38, COL["PINK"], text="ADMIN", align="center", anchor="left_middle", when="ADM"),
        Img([pl[0] - 6, pl[1] / 2 - 1.5, 3, 3], box("#3DDC97"), when="ON"),
        Img([pl[0] - 6, pl[1] / 2 - 1.5, 3, 3], box("#4A5468"), when="!ON"),
    ]), gap=1.8, click=True, scroll=True)
    sc = sz(533, 64)
    s.zone("SC", R(245, 71, 778, 135), sc, Face(box("#141A24", COL["CYAN"]), parts=[Img([5, 5, 14, 14]), Text([24, sc[1] / 2, 165], 0.65, anchor="left_middle")]))
    cat = sz(127, 57)
    s.zone("CAT", R(245, 147, 780, 204), cat, Face(box("#141A24", "#252D3B"), [("ON", box("#2A1424", COL["PINK"]))], [
        Img([cat[0] / 2 - 5, 3, 10, 10]), Text([0, 15, cat[0]], 0.55, align="center")]), orient="horizontal", gap=2.3, click=True)
    s.box(R(245, 215, 778, 593), "#11151D", "#252D3B")
    s.zone("CH", R(261, 230, 700, 242), (150, 5), Face(parts=[Text([0, 0, 150], 0.5, "#8E9BB5")]))
    opt = (58.2, 27.5)
    s.zone("OPT", R(261, 253, 766, 420), opt, Face(box("#0F1219", "#252D3B"), [("ON", box("#2A1424", COL["PINK"]))], [
        Img([opt[0] / 2 - 6, 3, 12, 12]), Text([1, 16, opt[0] - 2], 0.48, align="center")]), grid=True, gap=2.5, click=True, cols=3, rows=2)
    s.text(R(261, 438, 400, 450)[:3], "Amount", scale=0.62, color="#C9D1DD")
    stp = sz(38, 36)
    s.zone("STEP", R(520, 426, 690, 462), stp, Face(box("#1A202C", "#252D3B"), parts=[
        Text([0, stp[1] / 2, stp[0]], 0.52, align="center", anchor="left_middle")]), orient="horizontal", gap=2, click=True, align="top_right")
    s.zone("N", R(695, 426, 762, 462), sz(67, 36), Face(parts=[Text([0, 6.5, 24], 0.62, font=TEN, align="center", anchor="left_middle")]))
    give = sz(500, 42)
    s.zone("GIVE", R(261, 537, 761, 580), give, Face(box(COL["PINK"], bottom="#C94F92"), [("OFF", box("#2A3140"))], [
        Text([0, give[1] / 2, give[0]], 0.65, "#2A0E1E", font=TEN, align="center", anchor="left_middle")]), click=True)
    s.box(R(792, 71, 1076, 593), "#11151D", "#252D3B")
    s.zone("LOCK", R(806, 85, 1062, 280), sz(256, 195), Face(parts=[
        Img([38, 2, 16, 13], LOCK, when="!ADM"), Img([38, 2, 16, 13], UNLOCK, when="ADM"),
        Text([0, 20, 93], 0.75, align="center", font=TEN)]))
    s.zone("LOCKT", R(806, 85, 1062, 280), sz(256, 195), Face(parts=[Text([4, 30, 85], 0.52, "#8E9BB5", align="center")]))
    s.zone("TOOL", R(810, 290, 1062, 590), sz(250, 26), Face(box("#141A24"), [("OFF", box("#0F1219"))], [
        Img([3, 4.7 - 3.5, 7, 7], when="!OFF"),
        Text([12, 4.7, 75], 0.52, anchor="left_middle")]), gap=1.6, click=True)
    return s


def dispatch():
    s = Screen("dispatch", "5", bg="#15100E", border="#2A1F1B")
    s.zone("K", R(30, 30, 500, 44), (170, 6), Face(parts=[Text([0, 0, 170], 0.55, "#A8968A")]))
    s.text(R(30, 52, 500, 82)[:3], "RAID DISPATCH", scale=1.35, font=TEN)
    pill = sz(130, 38)
    s.zone("PILL", R(600, 52, 1070, 90), pill, Face(box("#1C1513", "#3A2E2A"), parts=[
        Img([3, pill[1] / 2 - 3.5, 7, 7]), Text([12, pill[1] / 2, 34], 0.55, anchor="left_middle")]), orient="horizontal", gap=3, align="top_right")
    rv = sz(1036, 49)
    s.zone("RV", R(32, 106, 1068, 155), rv, Face(box("#2A1212", COL["RED"]), parts=[
        Img([5, rv[1] / 2 - 4.5, 9, 9]), Text([19, rv[1] / 2, 290], 0.62, anchor="left_middle"),
        Img([rv[0] - 58, rv[1] / 2 - 5, 54, 10], box(COL["RED"], bottom="#B33A30"))]), click=True)
    s.zone("RVP", R(32, 106, 1068, 155), rv, Face(parts=[Text([rv[0] - 58, rv[1] / 2, 54], 0.55, "#2A0E0E", font=TEN, align="center", anchor="left_middle")]))
    card = sz(255, 415)
    pitch_gap = round(16 * F, 1)
    s.zone("RC", R(32, 172, 840, 590), card, Face(box("#1C1513", "#3A2E2A"), [("ON", box("#1C1513", COL["ORANGE"]))], [
        Img([6, 29, card[0] - 12, 79], box("#140F0D", "#3A2E2A")),
        Img([6, 14.5, 9, 9]),
        Text([18, 19, 70], 0.75, font=TEN, anchor="left_middle"),
    ]), orient="horizontal", gap=pitch_gap, click=True)
    s.zone("RCK", R(32, 172, 840, 590), card, Face(parts=[Text([6, 6, 80], 0.48)]), orient="horizontal", gap=pitch_gap)
    s.zone("RCX", R(32, 172, 840, 590), card, Face(parts=[Img([card[0] / 2 - 12, 74, 24, 24])]), orient="horizontal", gap=pitch_gap)
    s.zone("RCI", R(32, 172, 840, 590), card, Face(parts=[Text([10, 34, card[0] - 20], 0.55)]), orient="horizontal", gap=pitch_gap)
    s.zone("RCD", R(32, 172, 840, 590), card, Face(parts=[Text([6, 113, card[0] - 12], 0.52, "#C9BDB5")]), orient="horizontal", gap=pitch_gap)
    s.zone("RCB", R(32, 172, 840, 590), card, Face(parts=[
        Img([6, 129, card[0] - 12, 15], box(COL["ORANGE"], bottom="#B97E22"), when="!cRED"),
        Img([6, 129, card[0] - 12, 15], box(COL["RED"], bottom="#B33A30"), when="cRED"),
        Text([6, 136.5, card[0] - 12], 0.6, "#2A0E0E", font=TEN, align="center", anchor="left_middle")]), orient="horizontal", gap=pitch_gap)
    s.box(R(846, 172, 1068, 588), "#1C1513", "#3A2E2A")
    s.text(R(862, 190, 1060, 205)[:3], "Your squad", scale=0.8, font=TEN)
    s.text(R(862, 220, 1060, 230)[:3], "Everyone online goes", scale=0.5, color="#A8968A")
    sq = sz(189, 46)
    s.zone("SQ", R(862, 243, 1052, 510), sq, Face(box("#241B18"), parts=[Img([3, sq[1] / 2 - 5, 10, 10]), Text([16, sq[1] / 2, 40], 0.62, anchor="left_middle")]), gap=2)
    s.zone("SQS", R(862, 243, 1052, 510), sq, Face(parts=[Text([40, sq[1] / 2, 26], 0.5, align="right", anchor="left_middle")]), gap=2)
    s.text(R(862, 528, 1000, 575)[:3], "Lives each\nClan bank", scale=0.62, color="#A8968A")
    s.zone("FT", R(940, 528, 1052, 575), sz(112, 47), Face(parts=[Text([0, 0, 40.7], 0.62, align="right")]))
    return s


def insurance():
    s = Screen("insurance", "6", bg="#101512", border="#1E2522")
    s.img(R(35, 40, 75, 85), CB + "insurance")
    s.zone("K", R(92, 35, 500, 48), (150, 6), Face(parts=[Text([0, 0, 150], 0.55, "#8E9B95")]))
    s.text(R(92, 58, 600, 88)[:3], "INSURANCE VAULT", scale=1.35, font=TEN)
    s.text(R(700, 62, 1065, 95)[:3], "Get back part of the money stolen in a raid. Unlock each tier in order.", scale=0.55, color="#8E9B95", align="right")
    card = sz(244, 401)
    g = round(18 * F, 1)
    s.zone("TI", R(35, 117, 1065, 518), card, Face(box("#141A16", "#2A3330"), [
        ("ACT", box("#141A16", COL["GREEN"])), ("NEXT", box("#141A16", COL["GOLD"])), ("LOCK", box("#121614", "#1E2522"))], [
        Img([card[0] / 2 - 20, 16, 40, 40]), Text([0, 64, card[0]], 0.85, font=TEN, align="center")]), orient="horizontal", gap=g, click=True, tags=("OWN", "ACT", "NEXT", "LOCK"))
    s.zone("TIK", R(35, 117, 1065, 518), card, Face(parts=[Text([0, 7, card[0]], 0.48, align="center")]), orient="horizontal", gap=g)
    s.zone("TIP", R(35, 117, 1065, 518), card, Face(parts=[Text([0, 76, card[0]], 1.2, font=TEN, align="center")]), orient="horizontal", gap=g)
    s.zone("TID", R(35, 117, 1065, 518), card, Face(parts=[Text([6, 92, card[0] - 12], 0.52, "#A8B5AE", align="center")]), orient="horizontal", gap=g)
    s.zone("TIB", R(35, 117, 1065, 518), card, Face(parts=[
        Img([7, 124, card[0] - 14, 13.5], box("#232B27", bottom="#1A201D"), when="!NEXT"),
        Img([7, 124, card[0] - 14, 13.5], box(COL["GOLD"], bottom="#B98F2A"), when="NEXT"),
        Text([7, 130.75, card[0] - 14], 0.6, "#E0E6E2", font=TEN, align="center", anchor="left_middle")]), orient="horizontal", gap=g, tags=("OWN", "ACT", "LOCK"))
    s.box(R(35, 541, 772, 585), "#141A16", "#2A3330")
    s.img(R(50, 556, 65, 571), CB + "raidlog")
    s.text(R(74, 559, 200, 569)[:3], "Last claim", scale=0.6, color="#A8B5AE")
    s.zone("LC", R(300, 552, 760, 575), (167, 8), Face(parts=[Text([0, 4, 167], 0.58, align="right", anchor="left_middle")]))
    s.box(R(790, 541, 1065, 585), "#141A16", "#2A3330")
    s.img(R(806, 556, 821, 571), "textures/ui/eco/icon_coin")
    s.text(R(830, 559, 950, 569)[:3], "Covers", scale=0.6, color="#A8B5AE")
    s.text(R(900, 559, 1050, 569)[:3], "Money only", scale=0.62, align="right")
    return s


def shop():
    s = Screen("shop", "7", bg="#121A2E", border="#22304E")
    s.text(R(28, 32, 300, 60)[:3], "SKY SHOP", scale=1.3, font=TEN)
    cat = sz(205, 37)
    s.zone("CAT", R(28, 77, 236, 600), cat, Face(box("#172036", "#2A3654"), [("ON", box("#2A2412", COL["GOLD"]))], [
        Img([3, cat[1] / 2 - 3.5, 7, 7]), Text([13, cat[1] / 2, 60], 0.55, anchor="left_middle")]), gap=2.3, click=True)
    s.box(R(252, 28, 1072, 92), "#172036", "#2A3654")
    s.zone("HI", R(266, 40, 305, 80), (14, 14), Face(parts=[Img([0, 0, 14, 14])]))
    s.zone("HT", R(316, 40, 815, 82), (181, 15), Face(parts=[Text([0, 7.6, 181], 0.6, anchor="left_middle")]))
    chip = sz(74, 28)
    s.zone("SELL", R(820, 46, 894, 74), chip, Face(box("#2A2412", COL["GOLD"]), parts=[Text([0, chip[1] / 2, chip[0]], 0.52, COL["GOLD"], font=TEN, align="center", anchor="left_middle")]))
    s.zone("BAL", R(900, 47, 1060, 73), (58, 9), Face(parts=[Text([0, 4.7, 58], 0.72, align="right", anchor="left_middle")]))
    it = (70, 81)
    s.zone("IT", R(252, 106, 1076, 580), it, Face(box("#172036", "#2A3654"), [("BEST", box("#172036", "#5A4A1A"))], [
        Img([4, 4, 62, 25], box("#121828")),
        Img([25, 6.5, 20, 20]),
        Text([5, 33, 60], 0.62),
        Img([4, 69, 18, 8], box("#222B44")), Img([24, 69, 20, 8], box("#222B44")), Img([46, 69, 20, 8], box(COL["GOLD"])),
        Text([4, 70.6, 18], 0.45, "#C9D1DD", text="x1", align="center"),
        Text([24, 70.6, 20], 0.45, "#C9D1DD", text="x16", align="center"),
        Text([46, 70.6, 20], 0.45, "#1A1206", text="x64", align="center"),
        Img([46, 0, 24, 9], "textures/ui/eco/badge_hot", when="HOT"),
    ]), grid=True, gap=3, click=True, cols=4, rows=2)
    pg = (34, 10)
    s.zone("PG", R(252, 582, 1076, 612), pg, Face(box("#172036", "#2A3654"), [("OFF", box("#121828", "#1E2740"))], [
        Text([0, pg[1] / 2, pg[0]], 0.5, align="center", anchor="left_middle")]), orient="horizontal", gap=3, align="top_middle", click=True)
    return s


def crate():
    s = Screen("crate", "8", bg="#110E1C", border="#221C36")
    s.text(R(68, 32, 300, 42)[:3], "C R A T E", scale=0.5, color="#8E86B5")
    s.zone("CT", R(68, 52, 600, 85), (190, 12), Face(parts=[Text([0, 0, 190], 1.3, font=TEN)]))
    kb = sz(104, 42)
    s.zone("KEYS", R(926, 48, 1030, 90), kb, Face(box("#1A1530", "#3A3358"), parts=[Img([4, kb[1] / 2 - 4, 8, 8]), Text([15, kb[1] / 2, 22], 0.62, anchor="left_middle")]))
    s.box(R(72, 112, 1028, 287), "#0D0A16", "#1E1A30")
    it = sz(120, 135)
    rar = [("rC", "#9AA3B5"), ("rR", "#4FD1E8"), ("rE", "#A78BFA"), ("rL", "#F2C14E")]
    s.zone("RL", R(80, 130, 1020, 266), it, Face(box("#1C1830", "#2E2850"), [("WIN", box("#2A2412", COL["GOLD"]))], [
        Img([it[0] / 2 - 9.5, 9, 19, 19]), Text([1, 32, it[0] - 2], 0.48, align="center")] +
        [Img([0, it[1] - 2, it[0], 2], box(c), when=t) for t, c in rar]), orient="horizontal", gap=3.3, align="top_middle")
    s.box(R(547, 112, 552, 287), COL["GOLD"])
    s.box(R(540, 108, 559, 118), COL["GOLD"])
    s.box(R(540, 281, 559, 291), COL["GOLD"])
    op = sz(240, 48)
    s.zone("OP", R(430, 312, 672, 362), op, Face(box(COL["GOLD"], bottom="#B98F2A"), [("OFF", box("#3A3358"))], [
        Text([0, op[1] / 2, op[0]], 0.72, "#1A1206", font=TEN, align="center", anchor="left_middle")]), click=True)
    s.zone("MSG", R(200, 385, 900, 440), (255, 20), Face(parts=[Text([0, 0, 255], 0.8, align="center")]))
    od = sz(232, 55)
    s.zone("OD", R(70, 533, 1032, 590), od, Face(box("#1A1530", "#2E2850", bar="#9AA3B5"), [(t, box("#1A1530", "#2E2850", bar=c)) for t, c in rar], [
        Text([5, od[1] / 2, 55], 0.5, anchor="left_middle")]), orient="horizontal", gap=4)
    s.zone("ODP", R(70, 533, 1032, 590), od, Face(parts=[Text([55, od[1] / 2, 26], 0.72, font=TEN, align="right", anchor="left_middle")]), orient="horizontal", gap=4)
    return s


def raidlog():
    s = Screen("raidlog", "9", bg="#15100E", border="#2A1F1B")
    s.zone("K", R(30, 30, 280, 44), (90, 6), Face(parts=[Text([0, 0, 90], 0.55, "#A8968A")]))
    s.text(R(30, 52, 280, 82)[:3], "RAID LOG", scale=1.35, font=TEN)
    cards = [(103, 177, "raids", "Money stolen by us"), (190, 264, "broken", "Money stolen from us"), (277, 350, "insurance", "Insurance paid back")]
    for i, (y1, y2, ic, cap) in enumerate(cards):
        s.box(R(30, y1, 279, y2), "#1C1513", "#3A2E2A")
        s.img(R(42, y1 + 22, 74, y1 + 54), CB + ic)
        s.text(R(84, y1 + 15, 275, y1 + 25)[:3], cap, scale=0.55, color="#A8968A")
        s.zone(f"V{i + 1}", R(84, y1 + 33, 275, y1 + 65), (70, 10), Face(parts=[Text([0, 0, 70], 0.95, font=TEN)]))
    wl = sz(119, 60)
    s.zone("WL", R(30, 363, 282, 423), wl, Face(box("#1C1513", "#3A2E2A"), parts=[Text([0, 4, wl[0]], 0.7, align="center")]), orient="horizontal", gap=3)
    tab = sz(95, 32)
    s.zone("TAB", R(297, 32, 700, 64), tab, Face(box("#1C1513", "#3A2E2A"), [("ON", box(COL["ORANGE"]))], [
        Text([0, tab[1] / 2, tab[0]], 0.58, align="center", anchor="left_middle")]), orient="horizontal", gap=2.5, click=True)
    row = sz(771, 58)
    gap = round(12 * F, 1)
    types = [("tR", COL["RED"], "#3A1414"), ("tW", COL["GREEN"], "#123024"), ("tD", COL["CYAN"], "#12283A"), ("tF", "#8E7F75", "#2A2220")]
    s.zone("LOG", R(297, 74, 1068, 600), row, Face(box("#1C1513", "#3A2E2A"), [(t, box("#1C1513", "#3A2E2A", bar=c)) for t, c, _ in types],
           [Img([5, row[1] / 2 - 4, 41, 8], box(b), when=t) for t, _, b in types] +
           [Text([52, row[1] / 2, 140], 0.6, anchor="left_middle")]), gap=gap)
    s.zone("LOGB", R(297, 74, 1068, 600), row, Face(parts=[Text([8, row[1] / 2, 38], 0.48, anchor="left_middle")]), gap=gap)
    s.zone("LOGA", R(297, 74, 1068, 600), row, Face(parts=[Text([180, row[1] / 2, 64], 0.8, font=TEN, align="right", anchor="left_middle")]), gap=gap)
    s.zone("LOGT", R(297, 74, 1068, 600), row, Face(parts=[Text([248, row[1] / 2, 27], 0.52, "#A8968A", align="right", anchor="left_middle")]), gap=gap)
    return s


def boards():
    s = Screen("boards", "a", bg="#12101F", border="#221C36")
    s.img(R(30, 35, 66, 70), CB + "leaderboards")
    s.text(R(80, 40, 500, 70)[:3], "LEADERBOARDS", scale=1.35, font=TEN)
    tab = sz(110, 32)
    s.zone("TAB", R(560, 40, 1070, 72), tab, Face(box("#1C1830", "#2E2850"), [("ON", box(COL["PURPLE"]))], [
        Img([3, tab[1] / 2 - 3, 6, 6]), Text([11, tab[1] / 2, 29], 0.48, anchor="left_middle")]), orient="horizontal", gap=2, align="top_right")
    s.box(R(32, 90, 511, 587), "#161329", "#2E2850")
    for (x1, y1, x2, n, c, b) in ((68, 422, 196, "2", "#D9DEE8", "#A9B0BE"), (207, 370, 335, "1", "#F2C14E", "#B98F2A"), (346, 465, 474, "3", "#C08A55", "#8A5F35")):
        s.img(R(x1, y1, x2, 567), box(c, b, 2))
        s.text(R(x1, y1 + 18, x2, y1 + 40)[:3], n, scale=1.3, color="#1A1A28", font=TEN, align="center")
    pod = sz(128, 105)
    for tag, (x1, y1) in (("P2", (68, 310)), ("P1", (207, 258)), ("P3", (346, 352))):
        s.zone(tag, R(x1, y1, x1 + 128, y1 + 105), pod, Face(parts=[Img([pod[0] / 2 - 9, 0, 18, 18]), Text([0, 21, pod[0]], 0.62, align="center")]))
    row = sz(534, 41)
    gap = round(5.4 * F, 1)
    rowface = lambda bg: Face(bg, parts=[Img([18, row[1] / 2 - 4, 8, 8]), Text([30, row[1] / 2, 90], 0.62, anchor="left_middle")])
    s.zone("RK", R(534, 90, 1068, 420), row, rowface(box("#1C1830", "#2E2850")), gap=gap)
    s.zone("ME", R(534, 546, 1068, 587), row, rowface(box("#1C1830", COL["PURPLE"])))  # before its text zones
    for t, part in (("RKR", Text([4, row[1] / 2, 14], 0.55, "#8E86B5", anchor="left_middle")),
                    ("RKW", Text([118, row[1] / 2, 50], 0.5, "#8E86B5", align="right", anchor="left_middle")),
                    ("RKS", Text([170, row[1] / 2, 20], 0.7, font=TEN, align="right", anchor="left_middle"))):
        s.zone(t, R(534, 90, 1068, 420), row, Face(parts=[part]), gap=gap)
        s.zone("ME" + t[2], R(534, 546, 1068, 587), row, Face(parts=[part]))
    s.zone("NONE", R(534, 200, 1068, 240), (194, 10), Face(parts=[Text([0, 0, 194], 0.6, "#8E86B5", align="center")]))
    return s


def terminal():
    s = Screen("terminal", "t", bg="#0B1020", border="#1B2440")
    s.box(R(31, 31, 1035, 88), "#141B2D", "#26324D")
    s.img(R(47, 51, 66, 70), "textures/ui/cb/term_square")
    s.text(R(76, 52, 300, 70)[:3], "CORE TERMINAL", scale=1.0, font=TEN)
    s.zone("HC", R(300, 53, 700, 68), (140, 5), Face(parts=[Text([0, 0, 140], 0.55, "#8E9BB5")]))
    s.zone("BK", R(700, 49, 895, 72), (71, 8), Face(parts=[Text([0, 4, 71], 0.72, align="right", anchor="left_middle")]))
    chip = sz(120, 28)
    s.zone("SH", R(905, 46, 1025, 74), chip, Face(box("#0F2A24", COL["GREEN"]), [("DOWN", box("#2A0F0F", COL["RED"]))], [
        Text([0, chip[1] / 2, chip[0]], 0.5, font=TEN, align="center", anchor="left_middle")]))
    s.box(R(31, 107, 340, 533), "#141B2D", "#26324D")
    s.zone("CL", R(31, 122, 340, 135), (112, 5), Face(parts=[Text([0, 0, 112], 0.5, "#8E9BB5", align="center")]))
    s.img(R(110, 150, 262, 302), "textures/ui/cb/term_core")
    s.text(R(52, 318, 200, 365)[:3], "Upkeep\nNext charge\nBank covers", scale=0.6, color="#8E9BB5")
    s.zone("UPV", R(150, 318, 320, 365), (62, 17), Face(parts=[Text([0, 0, 62], 0.6, align="right")]))
    bar = sz(24, 10)
    s.zone("BAR", R(52, 380, 322, 392), bar, Face(box("#26324D"), [("ON", box(COL["GREEN"]))]), orient="horizontal", gap=1.0)
    dep = sz(268, 42)
    s.zone("DEP", R(52, 455, 322, 497), dep, Face(box(COL["GOLD"], bottom="#B98F2A"), parts=[
        Text([0, dep[1] / 2, dep[0]], 0.68, "#1A1206", font=TEN, align="center", anchor="left_middle")]), click=True)
    s.text(R(358, 110, 600, 125)[:3], "Core Modules", scale=0.85, font=TEN)
    s.zone("HDR", R(560, 112, 1069, 124), (185, 5), Face(parts=[Text([0, 0, 185], 0.5, "#8E9BB5", align="right")]))
    it = (83.5, 45.5)
    s.zone("MOD", R(358, 135, 1072, 535), it, Face(box("#141B2D", "#26324D"), [("OFF", box("#141B2D", "#4A2A2A"))], [
        Img([it[0] - 10, 3, 7, 7]),
        Text([4, 3, it[0] - 15], 0.5),
        Img([it[0] - 29, it[1] - 10.5, 26, 8], box("#1F5566", COL["CYAN"]), when="!MAX"),
        Text([it[0] - 29, it[1] - 6.5, 26], 0.4, text="UPGRADE", font=TEN, align="center", anchor="left_middle", when="!MAX"),
    ], hover=box("#4FD1E8", COL["CYAN"], alpha=30)), grid=True, gap=3, click=True, cols=3, rows=3)
    tab = sz(184, 38)
    s.zone("TAB", R(31, 548, 1069, 588), tab, Face(box("#141B2D", "#26324D"), [("ON", box("#1A2440", "#FFFFFF"))], [
        Text([0, tab[1] / 2, tab[0]], 0.58, "#B7C3D9", align="center", anchor="left_middle")]), orient="horizontal", gap=3, align="top_middle", click=True)
    return s


SCREENS = [tower, members, bank, settings, admin, dispatch, insurance, shop, crate, raidlog, boards, terminal]


def write_server_form(screens):
    """Action forms pick their layout from the title marker: eco tiles (§e§c§o),
    one of these screens (§c§b§<code>§r), or the vanilla form for anything else."""
    title = "#title_text"
    def has(m):
        return f"(not (({title} - '{m}') = {title}))"
    # plain form only when the title has neither marker. Kept to exactly two checks:
    # longer "and" chains aren't read reliably. Every screen marker starts with "§c§b".
    vanilla = f"((({title} - '§e§c§o') = {title}) and (({title} - '§c§b') = {title}))"
    ctrls = [
        {"vanilla_long_form": {
            "type": "panel", "size": [225, 200],
            "bindings": [{"binding_name": title}, {"binding_type": "view", "source_property_name": vanilla, "target_property_name": "#visible"}],
            "controls": [{"long_form@common_dialogs.main_panel_no_buttons": {
                "$title_panel": "common_dialogs.standard_title_label", "$title_size": ["100% - 14px", 10], "size": [225, 200],
                "$text_name": "#title_text", "$title_text_binding_type": "none", "$child_control": "server_form.long_form_panel", "layer": 2}}]}},
        {"eco_form@eco_form.eco_screen": {"bindings": [{"binding_name": title}, {"binding_type": "view", "source_property_name": has("§e§c§o"), "target_property_name": "#visible"}]}},
    ]
    for s in screens:
        ctrls.append({f"cb_{s.sid}@cb_screens.{s.sid}_screen": {"bindings": [
            {"binding_name": title}, {"binding_type": "view", "source_property_name": has(s.marker), "target_property_name": "#visible"}]}})
    form = {"namespace": "server_form", "long_form": {"type": "panel", "size": ["100%c", "100%c"], "controls": ctrls}}
    with open(os.path.join(RP, "ui", "server_form.json"), "w") as f:
        f.write("// AUTO-GENERATED by tools/build_cloudbreak_screens.py.\n")
        f.write("// Forms whose title starts with §e§c§o use the eco tile layout (eco_form.json),\n")
        f.write("// §c§b§<code>§r one of the Cloudbreak screens (cb_screens.json); anything else stays vanilla.\n")
        json.dump(form, f, indent=1, ensure_ascii=False)
    with open(os.path.join(RP, "ui", "_ui_defs.json"), "w") as f:
        json.dump({"ui_defs": ["ui/eco_form.json", "ui/cb_screens.json"]}, f, indent=2)


def build():
    screens = [f() for f in SCREENS]
    write_ui(screens, os.path.join(RP, "ui", "cb_screens.json"))  # first: it registers the hover textures too
    n = write_textures()
    write_server_form(screens)
    print(f"Built {len(screens)} screens, {n} textures.")
    return screens


if __name__ == "__main__":
    screens = build()
    if len(sys.argv) > 2 and sys.argv[1] == "preview":
        forms = json.load(open(sys.argv[2]))
        out = sys.argv[3] if len(sys.argv) > 3 else "."
        byid = {s.sid: s for s in screens}
        for name, form in forms.items():
            sid = name.split(":")[0]
            preview(byid[sid], form, os.path.join(out, f"{name.replace(':', '_')}.png"))
        print(f"Drew {len(forms)} previews.")
