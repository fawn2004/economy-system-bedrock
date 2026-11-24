"""Cloudbreak minion designs: two models (A and B) for each of the 10 minions.

Every design keeps the bone names the mining animation moves
(body, head, rightArm with the tool on "pickaxe"), so one animation works for all.
Model units: 16 = one block. The entity is scaled to 0.55 in game.
"""
from cb_models import Bone, Cube, Model, band, combine, dot, face_eyes, hexc, shade, speckle, stripes

SKIN = "#e8b07a"


# ---------------------------------------------------------------------------
# Shared parts
# ---------------------------------------------------------------------------


def pick(head="#5ee6e6", handle="#8a5a2b"):
    return [Cube([-6.5, 12.5, -10], [1, 1, 8], handle), Cube([-6.5, 9.5, -11], [1, 7, 1], head)]


def hoe(head="#cfcfcf", handle="#8a5a2b"):
    return [Cube([-6.5, 12.5, -11], [1, 1, 9], handle), Cube([-6.5, 9.5, -11.5], [1, 4, 2], head)]


def hammer(head="#4a4a4a", handle="#8a5a2b"):
    return [Cube([-6.5, 12.5, -10], [1, 1, 8], handle), Cube([-7.5, 9.5, -12], [3, 6, 3], head)]


def humanoid(ident, *, body, head, arm, leg, tool, head_extra=(), body_extra=(), extra_bones=(), leg_col=None,
             arm_col=None, head_size=8, inflate=1.5, legs=True, arm_len=12, tex=(64, 64)):
    """A standard minion: 8x12x4 body, big head, 4-wide arms and legs.
    body/head/arm/leg are Cube colour specs or full Cube lists."""
    def cubes(spec, default):
        if isinstance(spec, list):
            return spec
        if isinstance(spec, Cube):
            return [spec]
        return [default(spec)]
    hs = head_size
    bones = [
        Bone("root", [0, 0, 0]),
        Bone("body", [0, 24, 0], "root", cubes(body, lambda c: Cube([-4, 12, -2], [8, 12, 4], c)) + list(body_extra)),
        Bone("head", [0, 24, 0], "body",
             cubes(head, lambda c: Cube([-hs / 2, 24, -hs / 2], [hs, hs, hs], c, inflate=inflate)) + list(head_extra)),
        Bone("rightArm", [-5, 22, 0], "body", cubes(arm, lambda c: Cube([-8, 24 - arm_len, -2], [4, arm_len, 4], c))),
        Bone("pickaxe", [-6, 13, 0], "rightArm", tool),
        Bone("leftArm", [5, 22, 0], "body", cubes(arm_col or arm, lambda c: Cube([4, 24 - arm_len, -2], [4, arm_len, 4], c))),
    ]
    if legs:
        bones += [
            Bone("rightLeg", [-1.9, 12, 0], "root", cubes(leg, lambda c: Cube([-3.9, 0, -2], [4, 12, 4], c))),
            Bone("leftLeg", [1.9, 12, 0], "root", cubes(leg_col or leg, lambda c: Cube([-0.1, 0, -2], [4, 12, 4], c))),
        ]
    bones += list(extra_bones)
    return Model(ident, bones, tex)


def sleeve(col, hand=SKIN, glove=None):
    """Arm colour with a hand at the bottom."""
    def deco(face, px, x0, y0, w, h, base):
        if face in ("up",):
            return
        c = hexc(glove or hand)
        for x in range(w):
            for y in range(max(0, h - 3), h):
                dot(px, x0 + x, y0 + y, c)
        if face == "down":
            for x in range(w):
                for y in range(h):
                    dot(px, x0 + x, y0 + y, c)
    return deco


def arm(col, hand=SKIN, x=-8):
    return Cube([x, 12, -2], [4, 12, 4], col, decal=sleeve(col, hand))


def boots(col, boot="#3a2a1a"):
    def deco(face, px, x0, y0, w, h, base):
        if face == "up":
            return
        for x in range(w):
            for y in range(max(0, h - 3), h) if face != "down" else range(h):
                dot(px, x0 + x, y0 + y, boot)
    return deco


def leg(col, boot="#3a2a1a", x=-3.9):
    return Cube([x, 0, -2], [4, 12, 4], col, decal=boots(col, boot))


def legs(col, boot="#3a2a1a"):
    return leg(col, boot), leg(col, boot, -0.1)


# ---------------------------------------------------------------------------
# 1 Cloud Miner
# ---------------------------------------------------------------------------


def cloud_a():
    """Puff: a floating cloud with a sleepy face and an icicle pick. No legs."""
    white, shadow = "#f4f8fc", "#cfdbe8"
    face = face_eyes(pupil="#2c4f99", y=3, blush="#f6b7c4", mouth="#7d8aa0")
    return humanoid(
        "geometry.cb_minion_cloud_a",
        body=[Cube([-5, 12, -3], [10, 10, 6], white), Cube([-7, 13, -2], [14, 6, 4], shadow)],
        head=[Cube([-5, 22, -5], [10, 8, 10], white, decal=face)],
        head_extra=[Cube([-7, 23, -3], [3, 5, 6], white), Cube([4, 23, -3], [3, 5, 6], white),
                    Cube([-3, 30, -3], [6, 3, 6], white)],
        arm=Cube([-8, 14, -1.5], [3, 6, 3], white),
        leg=None, legs=False,
        tool=[Cube([-6.5, 12.5, -10], [1, 1, 8], "#9bd6ef"), Cube([-6.5, 9.5, -11], [1, 7, 1], "#e8fbff")],
        extra_bones=[Bone("rain", [0, 6, 0], "root", [
            Cube([-4, 5, -2], [8, 4, 4], "#aab8cc"),
            Cube([-3, 1, -1], [1, 3, 1], "#5fb4ff"), Cube([0, 0, 0], [1, 3, 1], "#5fb4ff"), Cube([2, 2, -1], [1, 2, 1], "#5fb4ff")])],
    )


def cloud_b():
    """Frost Yeti: shaggy white fur, blue face, ice-crystal horns, icicle pick."""
    fur, furd, blue = "#eef3f8", "#c8d4e2", "#7fb3e6"
    face = combine(front_only(lambda f, px, x0, y0, w, h, b: [dot(px, x0 + x, y0 + y, blue) for x in range(1, w - 1) for y in range(2, h - 1)]),
                   face_eyes(eye="#ffffff", pupil="#14305c", y=3, mouth="#14305c"))
    return humanoid(
        "geometry.cb_minion_cloud_b",
        body=Cube([-4, 12, -2], [8, 12, 4], fur, decal=speckle(furd, 2, 7)),
        head=[Cube([-4, 24, -4], [8, 8, 8], fur, inflate=1.5, decal=face)],
        head_extra=[Cube([-7, 31, -1], [2, 4, 2], "#bff3ff", rotation=[0, 0, 25], pivot=[-6, 31, 0]),
                    Cube([5, 31, -1], [2, 4, 2], "#bff3ff", rotation=[0, 0, -25], pivot=[6, 31, 0])],
        arm=Cube([-8, 11, -2], [4, 13, 4], fur, decal=combine(speckle(furd, 2, 3), sleeve(fur, blue))),
        leg=Cube([-3.9, 0, -2], [4, 12, 4], fur, decal=combine(speckle(furd, 2, 5), boots(fur, blue))),
        tool=[Cube([-6.5, 12.5, -10], [1, 1, 8], "#7a5a3a"), Cube([-6.5, 9.5, -11], [1, 7, 1], "#bff3ff")],
    )


# ---------------------------------------------------------------------------
# 2 Storm Miner
# ---------------------------------------------------------------------------


def _visor(col):
    def deco(face, px, x0, y0, w, h, base):
        if face != "north":
            return
        for x in range(1, w - 1):
            for y in range(3, 5):
                dot(px, x0 + x, y0 + y, col)
    return deco


def storm_a():
    """Copper Bot: copper robot, glowing visor, a real lightning rod antenna."""
    cu, cud, patina = "#d2794a", "#a0532d", "#5fb39a"
    return humanoid(
        "geometry.cb_minion_storm_a",
        body=Cube([-4, 12, -2], [8, 12, 4], cu, decal=combine(speckle(patina, 3, 4), band(cud, [5, 6]))),
        head=[Cube([-4, 24, -4], [8, 8, 8], cu, inflate=1.0, decal=combine(_visor("#ffe45c"), speckle(patina, 3, 9)))],
        head_extra=[Cube([-0.5, 33, -0.5], [1, 6, 1], "#c9703f"), Cube([-1, 39, -1], [2, 1, 2], "#e08a55"),
                    Cube([-1.5, 32, -1.5], [3, 1, 3], "#8a4a2a")],
        arm=Cube([-8, 12, -2], [4, 12, 4], cud, decal=sleeve(cud, "#4a4a4a")),
        leg=Cube([-3.9, 0, -2], [4, 12, 4], cud, decal=boots(cud, "#4a4a4a")),
        tool=pick("#ffe45c", "#6a6a6a"),
    )


def storm_b():
    """Thunderhead: a dark storm cloud for a head with lightning bolts, yellow raincoat."""
    cloud, cloudd, coat = "#5a6478", "#3c4456", "#f2c12e"
    face = face_eyes(eye="#fff38a", pupil="#fff38a", y=4)
    return humanoid(
        "geometry.cb_minion_storm_b",
        body=Cube([-4, 12, -2], [8, 12, 4], coat, decal=combine(band("#c98d12", [11]),
                                                            lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + w // 2, y0 + y, "#c98d12") for y in range(h)])),
        head=[Cube([-5, 24, -5], [10, 7, 10], cloud, decal=face)],
        head_extra=[Cube([-7, 25, -3], [3, 5, 6], cloudd), Cube([4, 25, -3], [3, 5, 6], cloudd), Cube([-3, 31, -3], [6, 3, 6], cloud),
                    Cube([-6, 22, -1], [1, 3, 1], "#fff38a", rotation=[0, 0, -20], pivot=[-6, 23, 0]),
                    Cube([5, 21, 0], [1, 3, 1], "#fff38a", rotation=[0, 0, 20], pivot=[5, 22, 0])],
        arm=Cube([-8, 12, -2], [4, 12, 4], coat, decal=sleeve(coat, SKIN)),
        leg=Cube([-3.9, 0, -2], [4, 12, 4], "#3a4a6a", decal=boots("#3a4a6a", "#f2c12e")),
        tool=pick("#c9703f", "#4a4a4a"),
    )


# ---------------------------------------------------------------------------
# 3 Sunforge
# ---------------------------------------------------------------------------


def sun_a():
    """Sunsmith: blacksmith with a golden sun-ray crown, leather apron and forge hammer."""
    apron = "#7a4a2a"
    rays = [Cube([x, 33, -0.5], [1, 3, 1], "#ffd23f", rotation=[0, 0, r], pivot=[x + 0.5, 33, 0]) for x, r in ((-4, 30), (-1.5, 10), (0.5, -10), (3, -30))]
    return humanoid(
        "geometry.cb_minion_sun_a",
        body=Cube([-4, 12, -2], [8, 12, 4], "#c05a2a", decal=lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + x, y0 + y, apron) for x in range(1, w - 1) for y in range(3, h)]),
        head=[Cube([-4, 24, -4], [8, 8, 8], "#f0b07a", inflate=1.5, decal=face_eyes(pupil="#7a2a0a", y=3, mouth="#a8502a"))],
        head_extra=[Cube([-5, 31, -5], [10, 2, 10], "#ffb000")] + rays,
        arm=arm("#c05a2a", "#f0b07a"),
        leg=leg("#5a3a2a", "#2a1a10"), leg_col=leg("#5a3a2a", "#2a1a10", -0.1),
        tool=hammer("#ffb000", "#5a3a2a"),
    )


def _cracks(col):
    def deco(face, px, x0, y0, w, h, base):
        pts = [(1, 2), (2, 3), (3, 3), (4, 4), (2, 6), (3, 7), (5, 8), (6, 9), (4, 10), (1, 9)]
        for (x, y) in pts:
            if x < w and y < h:
                dot(px, x0 + x, y0 + y, col)
    return deco


def sun_b():
    """Magmaling: dark basalt golem with glowing cracks and a flame tuft."""
    basalt, glow = "#3a3436", "#ff7a1f"
    face = combine(_cracks(glow), face_eyes(eye="#ffcf3f", pupil="#ff7a1f", y=3))
    return humanoid(
        "geometry.cb_minion_sun_b",
        body=Cube([-5, 12, -3], [10, 12, 6], basalt, decal=_cracks(glow)),
        head=[Cube([-4, 24, -4], [8, 7, 8], basalt, inflate=1.0, decal=face)],
        head_extra=[Cube([-2, 32, -2], [4, 3, 4], "#ff7a1f"), Cube([-1, 35, -1], [2, 2, 2], "#ffd23f")],
        arm=Cube([-9, 11, -2.5], [5, 13, 5], basalt, decal=_cracks(glow)),
        leg=Cube([-4, 0, -2.5], [4.5, 12, 5], basalt, decal=_cracks(glow)),
        leg_col=Cube([-0.5, 0, -2.5], [4.5, 12, 5], basalt, decal=_cracks(glow)),
        tool=pick("#ff7a1f", "#2a2426"),
    )


# ---------------------------------------------------------------------------
# 4 Void Miner
# ---------------------------------------------------------------------------


def void_a():
    """Voidwalker: tall hooded shadow with purple eyes, long arms and an orbiting shard."""
    robe, robed = "#1d1626", "#2e2140"
    face = face_eyes(eye="#d27cff", pupil="#d27cff", y=4, size=2, gap=2)
    return humanoid(
        "geometry.cb_minion_void_a",
        body=Cube([-4, 10, -2], [8, 14, 4], robe, decal=band(robed, [4, 9])),
        head=[Cube([-4, 24, -4], [8, 9, 8], robe, inflate=1.5, decal=combine(
            lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + x, y0 + y, "#09060e") for x in range(1, w - 1) for y in range(2, h - 1)], face))],
        arm=Cube([-7.5, 6, -1.5], [3, 18, 3], robed),
        leg=Cube([-3.9, 0, -2], [4, 10, 4], robe), leg_col=Cube([-0.1, 0, -2], [4, 10, 4], robe),
        tool=pick("#b05cff", "#1d1626"),
        extra_bones=[Bone("shard", [9, 30, 0], "body", [Cube([8, 28, -1], [2, 4, 2], "#d27cff", rotation=[0, 45, 0], pivot=[9, 30, 0])])],
    )


def void_b():
    """Void Diver: obsidian space suit, purple visor, air tank and boots."""
    suit, suitd = "#24202e", "#3a3448"
    visor = lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + x, y0 + y, "#b05cff" if (x + y) % 5 else "#e6b8ff") for x in range(1, w - 1) for y in range(2, h - 2)]
    return humanoid(
        "geometry.cb_minion_void_b",
        body=Cube([-4, 12, -2], [8, 12, 4], suit, decal=band(suitd, [6])),
        body_extra=[Cube([-3, 14, 2], [6, 9, 3], "#5a4a7a"), Cube([-1, 23, 3], [2, 2, 2], "#b05cff")],
        head=[Cube([-4, 24, -4], [8, 8, 8], suitd, inflate=1.5, decal=visor)],
        head_extra=[Cube([3.5, 31, -1], [1, 3, 1], "#b05cff")],
        arm=Cube([-8, 12, -2], [4, 12, 4], suit, decal=sleeve(suit, "#5a4a7a")),
        leg=Cube([-3.9, 0, -2], [4, 12, 4], suit, decal=boots(suit, "#5a4a7a")),
        tool=pick("#b05cff", "#3a3448"),
    )


# ---------------------------------------------------------------------------
# 5 Starfall
# ---------------------------------------------------------------------------


def star_a():
    """Star Knight: deep blue armour with gold trim, a star on the helmet and a cape."""
    navy, gold = "#22306b", "#f2c12e"
    helm = combine(band(gold, [0]), lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + x, y0 + y, "#0a0f24") for x in range(1, w - 1) for y in range(3, 5)])
    star = [Cube([-0.5, 33, -0.5], [1, 3, 1], gold), Cube([-1.5, 34, -0.5], [3, 1, 1], gold)]
    return humanoid(
        "geometry.cb_minion_star_a",
        body=Cube([-4, 12, -2], [8, 12, 4], navy, decal=combine(band(gold, [0, 11]), lambda f, px, x0, y0, w, h, b: f == "north" and dot(px, x0 + w // 2, y0 + 4, gold))),
        body_extra=[Cube([-4, 6, 2], [8, 17, 0.5], "#7a1f3a")],
        head=[Cube([-4, 24, -4], [8, 8, 8], navy, inflate=1.5, decal=helm)],
        head_extra=star,
        arm=Cube([-8, 12, -2], [4, 12, 4], navy, decal=combine(band(gold, [0]), sleeve(navy, gold))),
        leg=Cube([-3.9, 0, -2], [4, 12, 4], navy, decal=boots(navy, gold)),
        tool=pick("#7df0ff", gold),
    )


def star_b():
    """Prism: a living crystal with a floating gem head and a star halo."""
    teal, tealh, gem = "#3fb8a8", "#7fe8d8", "#c8fff6"
    return humanoid(
        "geometry.cb_minion_star_b",
        body=[Cube([-3, 12, -2], [6, 12, 4], teal, decal=speckle(tealh, 2, 11)), Cube([-4, 16, -3], [8, 6, 6], teal, rotation=[0, 45, 0], pivot=[0, 19, 0])],
        head=[Cube([-3.5, 26, -3.5], [7, 7, 7], gem, rotation=[0, 45, 0], pivot=[0, 29.5, 0],
                   decal=face_eyes(eye="#1d6b63", pupil="#1d6b63", y=3, size=1, gap=2))],
        head_extra=[Cube([-5, 35, -5], [10, 0.5, 1], "#f2c12e"), Cube([-5, 35, 4], [10, 0.5, 1], "#f2c12e"),
                    Cube([-5, 35, -4], [1, 0.5, 8], "#f2c12e"), Cube([4, 35, -4], [1, 0.5, 8], "#f2c12e")],
        arm=Cube([-7, 14, -1.5], [3, 9, 3], tealh), arm_col=Cube([4, 14, -1.5], [3, 9, 3], tealh),
        leg=Cube([-2.9, 0, -1.5], [3, 12, 3], teal), leg_col=Cube([-0.1, 0, -1.5], [3, 12, 3], teal),
        tool=pick(gem, "#1d6b63"),
    )


# ---------------------------------------------------------------------------
# 6 Meadow Sprite
# ---------------------------------------------------------------------------


def meadow_a():
    """Sprout: leafy green hair with a flower, straw hat, denim overalls, hoe."""
    hair = [Cube([-5, 30, -5], [10, 3, 10], "#4caf50"), Cube([-1, 33, -1], [2, 2, 2], "#ff7ab6"), Cube([-0.5, 35, -0.5], [1, 1, 1], "#ffe066")]
    hat = [Cube([-7, 32, -7], [14, 1, 14], "#e3c770"), Cube([-4, 33, -4], [8, 3, 8], "#e3c770", decal=band("#c0392b", [2]))]
    return humanoid(
        "geometry.cb_minion_meadow_a",
        body=Cube([-4, 12, -2], [8, 12, 4], "#3f6fd1", decal=lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + x, y0 + y, "#7cc46a") for x in range(w) for y in range(0, 3)]),
        head=[Cube([-4, 24, -4], [8, 8, 8], SKIN, inflate=1.5, decal=face_eyes(pupil="#2c6629", y=3, blush="#f6a5a5", mouth="#a0522d"))],
        head_extra=hair[:1] + hat,
        arm=arm("#7cc46a"), leg=leg("#3f6fd1", "#6a4a2a"), leg_col=leg("#3f6fd1", "#6a4a2a", -0.1),
        tool=hoe(),
    )


def meadow_b():
    """Sunny: a sunflower head with a petal ring, green stem body and leaf arms."""
    petal, centre, stem = "#ffd23f", "#6a3f1f", "#3f8f3a"
    petals = [Cube([-8, 25, -1], [3, 6, 2], petal), Cube([5, 25, -1], [3, 6, 2], petal),
              Cube([-3, 31, -1], [6, 3, 2], petal), Cube([-3, 22, -1], [6, 3, 2], petal),
              Cube([-7, 30, -1], [3, 3, 2], petal), Cube([4, 30, -1], [3, 3, 2], petal),
              Cube([-7, 22, -1], [3, 3, 2], petal), Cube([4, 22, -1], [3, 3, 2], petal)]
    return humanoid(
        "geometry.cb_minion_meadow_b",
        body=Cube([-3, 12, -2], [6, 12, 4], stem, decal=band("#2c6629", [3, 8])),
        head=[Cube([-5, 24, -2], [10, 8, 4], centre, decal=face_eyes(eye="#ffffff", pupil="#1d1d1d", y=2, mouth="#ffd23f"))],
        head_extra=petals,
        arm=Cube([-7, 15, -0.5], [4, 7, 1], "#5cbf4a"), arm_col=Cube([3, 15, -0.5], [4, 7, 1], "#5cbf4a"),
        leg=Cube([-2.9, 0, -1.5], [3, 12, 3], stem), leg_col=Cube([-0.1, 0, -1.5], [3, 12, 3], stem),
        tool=hoe("#cfcfcf", "#6a4a2a"),
        extra_bones=[Bone("pot", [0, 0, 0], "root", [Cube([-4, 0, -3], [8, 4, 6], "#b5543a", decal=band("#8a3a24", [0]))])],
    )


# ---------------------------------------------------------------------------
# 7 Ember Grower
# ---------------------------------------------------------------------------


def ember_a():
    """Shroomcap: a big crimson mushroom cap, dark body and a teal warped scarf."""
    cap = [Cube([-7, 31, -7], [14, 4, 14], "#b3202e", decal=speckle("#ffd9c0", 3, 2)), Cube([-4, 35, -4], [8, 2, 8], "#b3202e")]
    return humanoid(
        "geometry.cb_minion_ember_a",
        body=Cube([-4, 12, -2], [8, 12, 4], "#3a2a2e"),
        body_extra=[Cube([-4.5, 21, -2.5], [9, 3, 5], "#1fa39a")],
        head=[Cube([-4, 24, -4], [8, 7, 8], "#f2e0c8", inflate=1.0, decal=face_eyes(pupil="#3a1a1a", y=2, mouth="#a0522d"))],
        head_extra=cap,
        arm=arm("#3a2a2e", "#f2e0c8"), leg=leg("#2a1e22", "#1fa39a"), leg_col=leg("#2a1e22", "#1fa39a", -0.1),
        tool=hoe("#1fa39a", "#3a2a2e"),
    )


def ember_b():
    """Snout: a nether gardener with a pink snout, gold earrings and a nether-brick apron."""
    pink = "#e8a3a3"
    face = combine(face_eyes(pupil="#3a1a1a", y=2), lambda f, px, x0, y0, w, h, b: None)
    return humanoid(
        "geometry.cb_minion_ember_b",
        body=Cube([-4, 12, -2], [8, 12, 4], "#4a2028", decal=lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + x, y0 + y, "#2a1216" if (x + y // 2 * 2) % 4 == 0 else "#5a2830") for x in range(1, w - 1) for y in range(2, h)]),
        head=[Cube([-4, 24, -4], [8, 8, 8], pink, inflate=1.5, decal=face)],
        head_extra=[Cube([-2, 25, -7], [4, 3, 2], "#d48888", decal=lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + 1, y0 + 1, "#5a2a2a"), dot(px, x0 + w - 2, y0 + 1, "#5a2a2a")]),
                    Cube([-7, 26, -1], [1, 2, 1], "#f2c12e"), Cube([6, 26, -1], [1, 2, 1], "#f2c12e"),
                    Cube([-7, 29, -1], [2, 3, 2], pink), Cube([5, 29, -1], [2, 3, 2], pink)],
        arm=arm("#4a2028", pink), leg=leg("#2a1216", "#f2c12e"), leg_col=leg("#2a1216", "#f2c12e", -0.1),
        tool=hoe("#f2c12e", "#2a1216"),
    )


# ---------------------------------------------------------------------------
# 8 Canopy Keeper
# ---------------------------------------------------------------------------


def canopy_a():
    """Barkling: a little treant with a leafy canopy and branch arms."""
    bark, barkd, leaf = "#6a4a2a", "#4a321c", "#3f9f45"
    return humanoid(
        "geometry.cb_minion_canopy_a",
        body=Cube([-4, 12, -2], [8, 12, 4], bark, decal=stripes(barkd, 1, vertical=True)),
        head=[Cube([-4, 24, -4], [8, 7, 8], bark, decal=combine(stripes(barkd, 1, vertical=True), face_eyes(eye="#d8f27a", pupil="#1d3a10", y=2)))],
        head_extra=[Cube([-7, 30, -7], [14, 6, 14], leaf, decal=speckle("#2c7a32", 2, 4)), Cube([-4, 36, -4], [8, 3, 8], leaf),
                    Cube([5, 31, -8], [2, 2, 2], "#e03a3a")],
        arm=Cube([-8, 13, -1.5], [3, 11, 3], bark), arm_col=Cube([5, 13, -1.5], [3, 11, 3], bark),
        leg=Cube([-3.9, 0, -2], [4, 12, 4], barkd), leg_col=Cube([-0.1, 0, -2], [4, 12, 4], barkd),
        tool=hoe("#9fe870", bark),
    )


def canopy_b():
    """Ribbit: a frog gardener with big top eyes, a lily-pad hat and a vest."""
    frog, belly = "#5cae4a", "#c8e6a0"
    return humanoid(
        "geometry.cb_minion_canopy_b",
        body=Cube([-4, 12, -2], [8, 12, 4], frog, decal=lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + x, y0 + y, belly) for x in range(2, w - 2) for y in range(2, h - 1)]),
        body_extra=[Cube([-4.5, 18, -2.5], [9, 6, 5], "#8a5a2b", decal=lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + x, y0 + y, (0, 0, 0, 0)) for x in range(3, w - 3) for y in range(h)])],
        head=[Cube([-5, 24, -4], [10, 6, 8], frog, decal=lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + x, y0 + 4, "#2c5a22") for x in range(2, w - 2)])],
        head_extra=[Cube([-5, 30, -4], [4, 4, 4], frog, decal=face_eyes(eye="#ffffff", pupil="#111111", y=1, size=1, gap=0)),
                    Cube([1, 30, -4], [4, 4, 4], frog, decal=face_eyes(eye="#ffffff", pupil="#111111", y=1, size=1, gap=0)),
                    Cube([-6, 34, -6], [12, 1, 12], "#3a8a3a"), Cube([0, 35, -2], [2, 2, 2], "#ff9ad5")],
        arm=Cube([-8, 12, -2], [4, 12, 4], frog), leg=Cube([-3.9, 0, -2], [4, 12, 4], frog),
        tool=hoe("#cfcfcf", "#6a4a2a"),
    )


# ---------------------------------------------------------------------------
# 9 Bloomwarden
# ---------------------------------------------------------------------------


def bloom_a():
    """Buzz: a bee keeper with a striped body, see-through wings and antennae."""
    yel, blk = "#ffd23f", "#2a2218"
    wing = "#e8f6ff"
    return humanoid(
        "geometry.cb_minion_bloom_a",
        body=Cube([-4, 12, -2], [8, 12, 4], yel, decal=stripes(blk, 2)),
        body_extra=[Cube([-9, 18, 2], [7, 7, 0.5], wing, rotation=[0, 20, 0], pivot=[-2, 21, 2]),
                    Cube([2, 18, 2], [7, 7, 0.5], wing, rotation=[0, -20, 0], pivot=[2, 21, 2])],
        head=[Cube([-4, 24, -4], [8, 8, 8], yel, inflate=1.5, decal=combine(band(blk, [0, 1]), face_eyes(eye="#1d1d1d", pupil="#1d1d1d", y=3, size=2, gap=2)))],
        head_extra=[Cube([-3, 33, -2], [1, 4, 1], blk, rotation=[-20, 0, 15], pivot=[-2.5, 33, -1.5]), Cube([2, 33, -2], [1, 4, 1], blk, rotation=[-20, 0, -15], pivot=[2.5, 33, -1.5]),
                    Cube([-3.5, 36, -3], [2, 2, 2], blk), Cube([1.5, 36, -3], [2, 2, 2], blk)],
        arm=arm(blk, yel), leg=leg(blk, yel), leg_col=leg(blk, yel, -0.1),
        tool=hoe("#ffd23f", blk),
    )


def bloom_b():
    """Blossom: a cherry-blossom fairy with petal hair, petal wings and an azalea dress."""
    pinkp, pinkd, leaf = "#ffb7d5", "#f08ab8", "#6aa84f"
    return humanoid(
        "geometry.cb_minion_bloom_b",
        body=[Cube([-4, 16, -2], [8, 8, 4], leaf), Cube([-5, 10, -3], [10, 7, 6], leaf, decal=speckle(pinkp, 2, 8))],
        body_extra=[Cube([-10, 17, 2], [8, 9, 0.5], pinkp, rotation=[0, 25, 10], pivot=[-2, 21, 2]),
                    Cube([2, 17, 2], [8, 9, 0.5], pinkp, rotation=[0, -25, -10], pivot=[2, 21, 2])],
        head=[Cube([-4, 24, -4], [8, 8, 8], SKIN, inflate=1.5, decal=face_eyes(pupil="#8a2a5a", y=3, blush="#ff8ab8", mouth="#c0507a"))],
        head_extra=[Cube([-6, 30, -6], [12, 4, 12], pinkp, decal=speckle(pinkd, 2, 6)), Cube([-6, 24, 3], [12, 6, 3], pinkp),
                    Cube([3, 33, -6], [3, 2, 2], "#ffffff")],
        arm=arm(leaf), leg=Cube([-2.9, 0, -1.5], [3, 10, 3], SKIN, decal=boots(SKIN, pinkd)), leg_col=Cube([-0.1, 0, -1.5], [3, 10, 3], SKIN, decal=boots(SKIN, pinkd)),
        tool=hoe("#ffb7d5", "#6a4a2a"),
    )


# ---------------------------------------------------------------------------
# 10 Orchard King
# ---------------------------------------------------------------------------


def king_a():
    """The King: a gold crown with gems, a red royal cape with white fur and a gold hoe."""
    red, fur, gold = "#a8202a", "#f4f0e8", "#f2c12e"
    crown = [Cube([-5, 31, -5], [10, 3, 10], gold, decal=band("#c98d12", [2])),
             Cube([-5, 34, -5], [2, 2, 2], gold), Cube([3, 34, -5], [2, 2, 2], gold), Cube([-1, 34, -5], [2, 3, 2], gold),
             Cube([-0.5, 32, -5.5], [1, 1, 1], "#3fd1e8"), Cube([-3.5, 32, -5.5], [1, 1, 1], "#e03a3a"), Cube([2.5, 32, -5.5], [1, 1, 1], "#5cdb5c")]
    return humanoid(
        "geometry.cb_minion_king_a",
        body=Cube([-4, 12, -2], [8, 12, 4], red, decal=combine(band(fur, [0, 1]), lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + w // 2, y0 + y, gold) for y in range(2, h)])),
        body_extra=[Cube([-5, 4, 2], [10, 19, 0.5], red, decal=band(fur, [0, 1]))],
        head=[Cube([-4, 24, -4], [8, 8, 8], SKIN, inflate=1.5, decal=combine(face_eyes(pupil="#3a2a1a", y=3),
                                                                            lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + x, y0 + h - 2, "#d8d0c0") for x in range(2, w - 2)]))],
        head_extra=crown,
        arm=arm(red), leg=leg("#5a3a6a", gold), leg_col=leg("#5a3a6a", gold, -0.1),
        tool=hoe(gold, gold),
    )


def king_b():
    """Golden Apple: a golden apple for a head with a leaf and stalk, in a royal robe."""
    goldA, goldD, robe = "#f2c12e", "#c98d12", "#5a2a8a"
    return humanoid(
        "geometry.cb_minion_king_b",
        body=Cube([-4, 12, -2], [8, 12, 4], robe, decal=combine(band(goldA, [11]), lambda f, px, x0, y0, w, h, b: f == "north" and [dot(px, x0 + w // 2, y0 + y, goldA) for y in range(h)])),
        head=[Cube([-5, 24, -5], [10, 9, 10], goldA, decal=combine(speckle("#ffe88a", 3, 3), face_eyes(eye="#ffffff", pupil="#5a3a0a", y=3, mouth="#8a5a0a")))],
        head_extra=[Cube([-3, 33, -3], [6, 1, 6], goldD), Cube([-0.5, 34, -0.5], [1, 3, 1], "#6a4a2a"), Cube([0.5, 35, -0.5], [4, 1, 2], "#4caf50")],
        arm=arm(robe, goldA), leg=leg(robe, goldD), leg_col=leg(robe, goldD, -0.1),
        tool=hoe(goldA, "#6a4a2a"),
    )


def front_only(deco):
    def f(face, *a):
        if face == "north":
            deco(face, *a)
    return f


# id, display name, (design A, design B)
DESIGNS = [
    ("cloud", "Cloud Miner", (cloud_a, "Puff"), (cloud_b, "Frost Yeti")),
    ("storm", "Storm Miner", (storm_a, "Copper Bot"), (storm_b, "Thunderhead")),
    ("sun", "Sunforge", (sun_a, "Sunsmith"), (sun_b, "Magmaling")),
    ("void", "Void Miner", (void_a, "Voidwalker"), (void_b, "Void Diver")),
    ("star", "Starfall", (star_a, "Star Knight"), (star_b, "Prism")),
    ("meadow", "Meadow Sprite", (meadow_a, "Sprout"), (meadow_b, "Sunny")),
    ("ember", "Ember Grower", (ember_a, "Shroomcap"), (ember_b, "Snout")),
    ("canopy", "Canopy Keeper", (canopy_a, "Barkling"), (canopy_b, "Ribbit")),
    ("bloom", "Bloomwarden", (bloom_a, "Buzz"), (bloom_b, "Blossom")),
    ("king", "Orchard King", (king_a, "The King"), (king_b, "Golden Apple")),
]
