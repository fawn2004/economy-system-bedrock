"""
Small isometric renderer for shop icons (used by generate_prices.py).

Draws block-shaped items (stairs, slabs, walls, carpets, panes, full blocks...)
from their real block textures, shaded like Minecraft's inventory icons, so a
stair looks like a stair instead of a flat square. Needs Pillow.
"""
from PIL import Image, ImageDraw

SIZE = 64  # output icon size (px)
A, B, C = 1.85, 0.93, 2.02  # iso projection factors (x/z spread, x/z drop, height)
CX, CY = SIZE / 2, 1 + 16 * C

# Boxes are (x0, y0, z0, x1, y1, z1) in 0..16 block units, drawn in list order (back to front).
SHAPES = {
    "cube": [(0, 0, 0, 16, 16, 16)],
    "slab": [(0, 0, 0, 16, 8, 16)],
    "stairs": [(0, 0, 0, 16, 8, 16), (0, 8, 0, 16, 16, 8)],
    "wall": [(0, 0, 5, 4, 13, 11), (4, 0, 4, 12, 16, 12), (12, 0, 5, 16, 13, 11)],
    "carpet": [(0, 0, 0, 16, 1, 16)],
    "pane": [(0, 0, 7, 16, 16, 9)],
    # end rod: base plate + thin rod; the extra tuple = texture region (u0, v0, width, height) to sample
    "rod": [(6, 0, 6, 10, 1, 10, (2, 2, 4, 4)), (7, 1, 7, 9, 16, 9, (0, 0, 2, 15))],
    # shelf: half-depth, open side towards you
    "shelf": [(0, 0, 8, 16, 16, 16)],
    "chest": [(1, 0, 1, 15, 14, 15)],
    "table12": [(0, 0, 0, 16, 12, 16)],  # enchanting table
    "table9": [(0, 0, 0, 16, 9, 16)],  # stonecutter
    "lectern": [(0, 0, 0, 16, 2, 16), (4, 2, 4, 12, 13, 12), (0, 13, 0, 16, 15, 16)],
    "grindstone": [(3, 0, 6, 5, 4, 10), (2, 4, 4, 14, 14, 12), (11, 0, 6, 13, 4, 10)],
    "anvil": [(2, 0, 2, 14, 4, 14), (4, 4, 5, 12, 10, 11), (0, 10, 3, 16, 16, 13)],
    "button": [(4, 0, 5, 12, 4, 11)],
    "plate": [(1, 0, 1, 15, 1, 15)],
    "lrod": [(7, 0, 7, 9, 12, 9, (0, 4, 2, 12)), (6, 12, 6, 10, 16, 10, (0, 0, 4, 4))],
    "heavy": [(4, 0, 4, 12, 8, 12, (0, 8, 8, 8))],
    "egg": [(3, 0, 3, 13, 2, 13), (2, 2, 2, 14, 8, 14), (3, 8, 3, 13, 12, 13), (5, 12, 5, 11, 15, 11), (6, 15, 6, 10, 16, 10)],
}
SHADE = {"top": 1.0, "south": 0.82, "east": 0.64}


def proj(x, y, z):
    return (CX + (x - z) * A, CY + (x + z) * B - y * C)


def load(path):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    if h > w:  # animated strip: first frame
        img = img.crop((0, 0, w, w))
    return img


def load_full(path):
    """Like load(), but keeps the whole image (for texture sheets)."""
    return Image.open(path).convert("RGBA")


def sample(tex, u, v):
    w, h = tex.size
    return tex.getpixel((min(w - 1, int(u / 16 * w)), min(h - 1, int(v / 16 * h))))


def render(shape, side, top=None, front=None, out_path=None):
    """side/top/front: PIL images (front = the south face, e.g. a shelf's front)."""
    top = top or side
    img = Image.new("RGBA", (SIZE * 2, SIZE * 2), (0, 0, 0, 0))  # 2x then shrink = smoother edges
    d = ImageDraw.Draw(img)

    def quad(pts, col, shade):
        if col[3] < 8:
            return
        c = (int(col[0] * shade), int(col[1] * shade), int(col[2] * shade), col[3])
        d.polygon([(px * 2, py * 2) for px, py in pts], fill=c)

    for box in SHAPES[shape]:
        x0, y0, z0, x1, y1, z1 = box[:6]
        region = box[6] if len(box) > 6 else None

        def tx(u, v, region=region):
            if not region:
                return u, v
            u0, v0, w, h = region
            return u0 + (int(u) % w), v0 + (int(v) % h)

        # top face (y = y1): u = x, v = z
        for x in range(x0, x1):
            for z in range(z0, z1):
                quad([proj(x, y1, z), proj(x + 1, y1, z), proj(x + 1, y1, z + 1), proj(x, y1, z + 1)], sample(top, *tx(x, z)), SHADE["top"])
        # south face (z = z1): u = x, v = 16 - y
        tex = front or side
        for x in range(x0, x1):
            for y in range(y0, y1):
                quad([proj(x, y + 1, z1), proj(x + 1, y + 1, z1), proj(x + 1, y, z1), proj(x, y, z1)], sample(tex, *tx(x, 15 - y)), SHADE["south"])
        # east face (x = x1): u = 16 - z, v = 16 - y
        for z in range(z0, z1):
            for y in range(y0, y1):
                quad([proj(x1, y + 1, z), proj(x1, y + 1, z + 1), proj(x1, y, z + 1), proj(x1, y, z)], sample(side, *tx(15 - z, 15 - y)), SHADE["east"])
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    if out_path:
        img.save(out_path)
    return img
