"""Tiny toolkit for Cloudbreak entity models.

  * Model / Bone / Cube: describe a Bedrock geometry with flat-coloured cubes
  * build(model) -> (geo_json, texture Image): packs every cube's box UV into a
    texture and paints it (base colour, light top, dark bottom edge, decals)
  * render(model, texture) -> Image: software renderer for previews
    (orthographic 3/4 view, depth buffer, simple lighting)

Bedrock box UV for a cube of size (w, h, d) at uv (u, v):
    up    (u+d,     v)      w x d        down  (u+d+w,   v)      w x d
    west  (u,       v+d)    d x h        north (u+d,     v+d)    w x h   <- front (-Z)
    east  (u+d+w,   v+d)    d x h        south (u+2d+w,  v+d)    w x h
"""
import math

from PIL import Image

# ---------------------------------------------------------------------------
# Description
# ---------------------------------------------------------------------------


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shade(c, f):
    if f >= 0:
        return tuple(min(255, int(x + (255 - x) * f)) for x in c[:3]) + (c[3],)
    return tuple(max(0, int(x * (1 + f))) for x in c[:3]) + (c[3],)


class Cube:
    def __init__(self, origin, size, color, inflate=0, rotation=None, pivot=None, decal=None, faces=None, edge=True):
        self.origin, self.size = list(origin), list(size)
        self.color = hexc(color) if isinstance(color, str) else color
        self.inflate = inflate
        self.rotation, self.pivot = rotation, pivot
        # decal(face, px, x0, y0, w, h, color): paints details on a face region
        self.decal = decal
        # per-face colour overrides {"north": "#hex", ...}
        self.faces = {k: (hexc(v) if isinstance(v, str) else v) for k, v in (faces or {}).items()}
        self.edge = edge
        self.uv = None


class Bone:
    def __init__(self, name, pivot, parent=None, cubes=(), rotation=None):
        self.name, self.pivot, self.parent = name, list(pivot), parent
        self.cubes = list(cubes)
        self.rotation = rotation


class Model:
    def __init__(self, ident, bones, tex_size=(64, 64)):
        self.ident, self.bones, self.tex_size = ident, bones, tex_size


# ---------------------------------------------------------------------------
# UV packing + painting
# ---------------------------------------------------------------------------


def _box_dims(c):
    w, h, d = [max(1, int(math.ceil(s))) if s > 0 else 0 for s in c.size]
    return w, h, d, 2 * (d + w), d + h


def build(model):
    cubes = [c for b in model.bones for c in b.cubes]
    # shelf packing, biggest first; grow the texture until everything fits
    order = sorted(cubes, key=lambda c: -_box_dims(c)[4] * 100 - _box_dims(c)[3])
    for tw, th in (model.tex_size, (128, 64), (128, 128), (256, 128), (256, 256)):
        x = y = shelf = 0
        fits = True
        for c in order:
            w, h, d, bw, bh = _box_dims(c)
            if x + bw > tw:
                x, y, shelf = 0, y + shelf, 0
            if y + bh > th or bw > tw:
                fits = False
                break
            c.uv = (x, y)
            x += bw
            shelf = max(shelf, bh)
        if fits:
            break
    else:
        raise ValueError(f"{model.ident}: model too big for a 256x256 texture")
    img = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    px = img.load()
    for c in cubes:
        _paint(c, px)
    geo = {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {"identifier": model.ident, "texture_width": tw, "texture_height": th,
                            "visible_bounds_width": 3, "visible_bounds_height": 3.5, "visible_bounds_offset": [0, 1.25, 0]},
            "bones": [_bone_json(b) for b in model.bones],
        }],
    }
    return geo, img


def _bone_json(b):
    j = {"name": b.name, "pivot": b.pivot}
    if b.parent:
        j["parent"] = b.parent
    if b.rotation:
        j["rotation"] = b.rotation
    cubes = []
    for c in b.cubes:
        cj = {"origin": c.origin, "size": c.size, "uv": list(c.uv)}
        if c.inflate:
            cj["inflate"] = c.inflate
        if c.rotation:
            cj["rotation"] = c.rotation
            cj["pivot"] = c.pivot or [c.origin[i] + c.size[i] / 2 for i in range(3)]
        cubes.append(cj)
    if cubes:
        j["cubes"] = cubes
    return j


def face_regions(c):
    w, h, d, _, _ = _box_dims(c)
    u, v = c.uv
    return {
        "up": (u + d, v, w, d), "down": (u + d + w, v, w, d),
        "west": (u, v + d, d, h), "north": (u + d, v + d, w, h),
        "east": (u + d + w, v + d, d, h), "south": (u + 2 * d + w, v + d, w, h),
    }


def _paint(c, px):
    for face, (x0, y0, w, h) in face_regions(c).items():
        base = c.faces.get(face, c.color)
        if face == "up":
            base = shade(base, 0.12)
        elif face == "down":
            base = shade(base, -0.25)
        for x in range(x0, x0 + w):
            for y in range(y0, y0 + h):
                col = base
                # soft edge shading on sides: darker bottom row, lighter top row
                if c.edge and face in ("north", "south", "east", "west") and h >= 3:
                    if y == y0 + h - 1:
                        col = shade(base, -0.18)
                    elif y == y0:
                        col = shade(base, 0.10)
                px[x, y] = col
        if c.decal:
            c.decal(face, px, x0, y0, w, h, base)


# ---------------------------------------------------------------------------
# Decal helpers
# ---------------------------------------------------------------------------


def dot(px, x, y, col):
    px[x, y] = hexc(col) if isinstance(col, str) else col


def face_eyes(eye="#ffffff", pupil="#1d2b53", y=None, gap=2, mouth=None, blush=None, size=2):
    """Two eyes (and optional mouth) on the front face, centred."""
    def deco(face, px, x0, y0, w, h, base):
        if face != "north":
            return
        ey = y0 + (y if y is not None else h // 2 - 1)
        cx = x0 + w // 2
        for side in (-1, 1):
            ex = cx + side * (gap // 2 + size) - (size if side < 0 else 0) + (0 if side < 0 else -size + size)
            ex = cx - gap // 2 - size if side < 0 else cx + gap // 2 + (gap % 2)
            for i in range(size):
                for j in range(size):
                    dot(px, ex + i, ey + j, eye)
            dot(px, ex + (size - 1 if side < 0 else 0), ey + size - 1, pupil)
            if blush:
                dot(px, ex + (-1 if side < 0 else size), ey + size + 1, blush)
        if mouth:
            my = ey + size + 2
            for i in range(-1, 1):
                dot(px, cx + i, my, mouth)
    return deco


def stripes(col, every=2, vertical=False):
    def deco(face, px, x0, y0, w, h, base):
        if face in ("up", "down"):
            return
        for x in range(w):
            for y in range(h):
                if (x if vertical else y) % (every * 2) < every:
                    dot(px, x0 + x, y0 + y, col)
    return deco


def speckle(col, step=3, seed=1):
    def deco(face, px, x0, y0, w, h, base):
        n = seed
        for x in range(w):
            for y in range(h):
                n = (n * 1103515245 + 12345) & 0x7FFFFFFF
                if n % (step * step) == 0:
                    dot(px, x0 + x, y0 + y, col)
    return deco


def combine(*decos):
    def deco(*a):
        for d in decos:
            if d:
                d(*a)
    return deco


def front_only(deco):
    def f(face, *a):
        if face == "north":
            deco(face, *a)
    return f


def band(col, rows):
    """Horizontal band on the 4 sides: rows = list of row offsets from the top."""
    def deco(face, px, x0, y0, w, h, base):
        if face in ("up", "down"):
            return
        for r in rows:
            if 0 <= r < h:
                for x in range(w):
                    dot(px, x0 + x, y0 + r, col)
    return deco


# ---------------------------------------------------------------------------
# Renderer (previews only)
# ---------------------------------------------------------------------------


def _rot(p, rot, pivot):
    if not rot:
        return p
    x, y, z = (p[i] - pivot[i] for i in range(3))
    rx, ry, rz = (math.radians(a) for a in rot)
    # Bedrock applies rotations in Z, Y, X order around the pivot
    x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
    x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
    y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
    return (x + pivot[0], y + pivot[1], z + pivot[2])


def _bone_chain(model, bone):
    chain, by = [], {b.name: b for b in model.bones}
    while bone:
        chain.append(bone)
        bone = by.get(bone.parent)
    return chain


def render(model, tex, size=360, yaw=-32, pitch=22, scale=None, pose=None, bg=(0, 0, 0, 0)):
    """pose: {bone_name: [rx, ry, rz]} extra rotations (e.g. a raised arm)."""
    pose = pose or {}
    tp = tex.load()
    faces = []
    for b in model.bones:
        chain = _bone_chain(model, b)
        for c in b.cubes:
            w, h, d = c.size
            inf = c.inflate
            o = [c.origin[i] - inf for i in range(3)]
            s = [w + 2 * inf, h + 2 * inf, d + 2 * inf]
            corners = {}
            for ix in (0, 1):
                for iy in (0, 1):
                    for iz in (0, 1):
                        p = (o[0] + ix * s[0], o[1] + iy * s[1], o[2] + iz * s[2])
                        if c.rotation:
                            p = _rot(p, c.rotation, c.pivot or [c.origin[i] + c.size[i] / 2 for i in range(3)])
                        for bb in chain:
                            r = [a + e for a, e in zip(bb.rotation or [0, 0, 0], pose.get(bb.name, [0, 0, 0]))]
                            if any(r):
                                p = _rot(p, r, bb.pivot)
                        corners[(ix, iy, iz)] = p
            reg = face_regions(c)
            # quad corners as (corner key, texture u, v) in order TL, TR, BR, BL (as seen from outside)
            quads = {
                "north": [(0, 1, 0), (1, 1, 0), (1, 0, 0), (0, 0, 0)],
                "south": [(1, 1, 1), (0, 1, 1), (0, 0, 1), (1, 0, 1)],
                "west": [(0, 1, 1), (0, 1, 0), (0, 0, 0), (0, 0, 1)],
                "east": [(1, 1, 0), (1, 1, 1), (1, 0, 1), (1, 0, 0)],
                "up": [(0, 1, 1), (1, 1, 1), (1, 1, 0), (0, 1, 0)],
                "down": [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)],
            }
            for f, keys in quads.items():
                fw, fh = reg[f][2], reg[f][3]
                if fw == 0 or fh == 0:
                    continue
                pts = [corners[k] for k in keys]
                faces.append((pts, reg[f]))
    # camera
    cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))

    def view(p):
        x, y, z = p
        x, z = x * cy - z * sy, x * sy + z * cy  # yaw
        y, z = y * cp + z * sp, -y * sp + z * cp  # pitch (look down at the model)
        return x, y, z

    vf = [([view(p) for p in pts], reg) for pts, reg in faces]
    xs = [p[0] for pts, _ in vf for p in pts]
    ys = [p[1] for pts, _ in vf for p in pts]
    span = max(max(xs) - min(xs), max(ys) - min(ys)) or 1
    k = scale or (size * 0.86) / span
    cxm, cym = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    img = Image.new("RGBA", (size, size), bg)
    out = img.load()
    zbuf = [[1e9] * size for _ in range(size)]
    light = (0.35, 0.8, -0.5)
    ln = math.sqrt(sum(a * a for a in light))
    light = tuple(a / ln for a in light)

    def scr(p):
        return (size / 2 + (p[0] - cxm) * k, size / 2 - (p[1] - cym) * k, p[2])

    for pts, (u0, v0, fw, fh) in vf:
        P = [scr(p) for p in pts]
        # normal in view space (z points away from camera)
        ax, ay, az = (pts[1][i] - pts[0][i] for i in range(3))
        bx, by, bz = (pts[3][i] - pts[0][i] for i in range(3))
        nx, ny, nz = ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx
        nl = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
        nx, ny, nz = nx / nl, ny / nl, nz / nl
        if nz > 0.001:  # facing away (z grows away from the viewer)
            continue
        bright = min(1.0, 0.78 + 0.32 * max(0, -(nx * light[0] + ny * light[1] + nz * light[2])))
        for tri in ((0, 1, 2), (0, 2, 3)):
            A, B, C = (P[i] for i in tri)
            uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
            ua, ub, uc = (uvs[i] for i in tri)
            minx, maxx = int(max(0, min(A[0], B[0], C[0]))), int(min(size - 1, max(A[0], B[0], C[0]) + 1))
            miny, maxy = int(max(0, min(A[1], B[1], C[1]))), int(min(size - 1, max(A[1], B[1], C[1]) + 1))
            den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
            if abs(den) < 1e-9:
                continue
            for yy in range(miny, maxy + 1):
                for xx in range(minx, maxx + 1):
                    qx, qy = xx + 0.5, yy + 0.5
                    l1 = ((B[1] - C[1]) * (qx - C[0]) + (C[0] - B[0]) * (qy - C[1])) / den
                    l2 = ((C[1] - A[1]) * (qx - C[0]) + (A[0] - C[0]) * (qy - C[1])) / den
                    l3 = 1 - l1 - l2
                    if l1 < -1e-6 or l2 < -1e-6 or l3 < -1e-6:
                        continue
                    z = l1 * A[2] + l2 * B[2] + l3 * C[2]
                    if z >= zbuf[yy][xx]:
                        continue
                    s = l1 * ua[0] + l2 * ub[0] + l3 * uc[0]
                    t = l1 * ua[1] + l2 * ub[1] + l3 * uc[1]
                    tx = u0 + min(fw - 1, int(s * fw))
                    ty = v0 + min(fh - 1, int(t * fh))
                    col = tp[tx, ty]
                    if col[3] < 10:
                        continue
                    zbuf[yy][xx] = z
                    out[xx, yy] = (int(col[0] * bright), int(col[1] * bright), int(col[2] * bright), 255)
    return img
