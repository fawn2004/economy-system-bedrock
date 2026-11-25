"""Cloudbreak screen kit: describe a menu screen once, get both
  * the Bedrock JSON UI for it (ui/cb_screens.json), and
  * a preview picture drawn from the same description (for checking layouts).

How a screen gets its data
--------------------------
The script sends a normal action form. Its title starts with the screen's
marker ("§c§b§<code>§r"), and every button starts with a zone tag, e.g.
"[FL]§8F9  §fSettings". The screen shows each button in the zone with that
tag; extra state tags ("[ON]", "[cRED]") pick colours. Buttons in a
non-clickable zone are drawn as text/pictures only.

Coordinates: rects are given in the pixels of the 1100 x 619 mockup pictures
and scaled to the in-game canvas (400 x 225 UI units).
"""
import json
import os
import re

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
RP = os.path.join(ROOT, "packs", "Cloudbreak_RP")
TEX_DIR = os.path.join(RP, "textures", "ui", "cb", "s")
TEX_PATH = "textures/ui/cb/s/"

W, H = 400, 225
F = 400 / 1100
# Every screen is drawn this much bigger in game (positions, sizes and text alike).
# 1.2 -> 480 x 270 UI units: bigger and easier to read, still fits phone screens.
SCALE = 1.2


def R(x1, y1, x2, y2):
    """Mockup picture rect -> canvas [x, y, w, h]."""
    return [round(x1 * F, 1), round(y1 * F, 1), round((x2 - x1) * F, 1), round((y2 - y1) * F, 1)]


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def rgbf(h):
    c = hexc(h)
    return [round(c[0] / 255, 3), round(c[1] / 255, 3), round(c[2] / 255, 3)]


# ---------------------------------------------------------------------------
# Textures (generated into textures/ui/cb/s)
# ---------------------------------------------------------------------------
TEXTURES = {}  # name -> function(path) that writes the png (+ json)


def box(fill, border=None, bw=1, bar=None, bottom=None, alpha=255):
    """A nine-slice panel. bar = colour of a 2-unit bar on the left edge;
    bottom = darker 2-unit lip at the bottom (buttons)."""
    name = "b_" + "_".join(str(x).lstrip("#").lower() for x in (fill, border, bw, bar, bottom, alpha) if x not in (None, 255))
    if name not in TEXTURES:
        def make(path, fill=fill, border=border, bw=bw, bar=bar, bottom=bottom, alpha=alpha):
            n = 12
            img = Image.new("RGBA", (n, n), hexc(fill, alpha))
            px = img.load()
            if bottom:
                for x in range(n):
                    for y in range(n - 2, n):
                        px[x, y] = hexc(bottom, alpha)
            if border:
                for i in range(n):
                    for w in range(bw):
                        for c in ((i, w), (i, n - 1 - w), (w, i), (n - 1 - w, i)):
                            px[c] = hexc(border)
            if bar:
                for y in range(n):
                    for x in range(2):
                        px[x, y] = hexc(bar)
            img.save(path + ".png")
            ns = max(bw, 2 if (bar or bottom) else bw, 1) + 1
            with open(path + ".json", "w") as f:
                json.dump({"nineslice_size": ns, "base_size": [n, n]}, f)
        TEXTURES[name] = make
    return TEX_PATH + name


def art(name, rows, pal, scale=1):
    """A pixel picture from rows of palette letters ("." = see-through)."""
    if name not in TEXTURES:
        def make(path, rows=rows, pal=pal, scale=scale):
            h, w = len(rows), len(rows[0])
            img = Image.new("RGBA", (w * scale, h * scale), (0, 0, 0, 0))
            px = img.load()
            for y, row in enumerate(rows):
                for x, ch in enumerate(row):
                    if ch == ".":
                        continue
                    for dx in range(scale):
                        for dy in range(scale):
                            px[x * scale + dx, y * scale + dy] = hexc(pal[ch])
            img.save(path + ".png")
        TEXTURES[name] = make
    return TEX_PATH + name


def write_textures():
    os.makedirs(TEX_DIR, exist_ok=True)
    for f in os.listdir(TEX_DIR):
        os.remove(os.path.join(TEX_DIR, f))
    for name, make in TEXTURES.items():
        make(os.path.join(TEX_DIR, name))
    return len(TEXTURES)


# ---------------------------------------------------------------------------
# Screen description
# ---------------------------------------------------------------------------
class Text:
    """A label. In a zone item it shows the button's text (tags removed).
    rect = [x, y, w] (item- or canvas-relative). anchor "top_left": y is the
    top of the text; "left_middle": y is its middle line."""

    def __init__(self, rect, scale=0.75, color="#FFFFFF", font=None, align="left", text=None, anchor="top_left", shadow=False, when=None):
        self.rect, self.scale, self.color, self.font = rect, scale, color, font
        self.align, self.text, self.anchor, self.shadow, self.when = align, text, anchor, shadow, when


class Img:
    """A picture. texture=None means "the button's own icon". when = state
    tag that must be present ("!TAG" = must be absent; None = always)."""

    def __init__(self, rect, texture=None, when=None):
        self.rect, self.texture, self.when = rect, texture, when


class Face:
    """What one zone item looks like.
    bg: default background texture; states: [(tag, texture)] replace it.
    parts: Img / Text list drawn on top (rects relative to the item)."""

    def __init__(self, bg=None, states=(), parts=(), hover=None):
        self.bg, self.states, self.parts, self.hover = bg, list(states), list(parts), hover


class Zone:
    def __init__(self, tag, rect, item, face, orient="vertical", gap=0, click=False, align="top_left", grid=False, scroll=False, tags=(), cols=1, rows=1):
        self.tag, self.rect, self.item, self.face = tag, rect, item, face
        self.cols, self.rows = cols, rows
        if grid and scroll:
            raise ValueError("grids don't scroll (cells for other zones would make empty space); use pages")
        self.orient, self.gap, self.click, self.align = orient, gap, click, align
        self.grid, self.scroll = grid, scroll
        # every tag an item of this zone can carry (stripped from its text)
        found = {s for s, _ in face.states} | {p.when.lstrip("!") for p in face.parts if p.when}
        self.tags = [f"[{tag}]"] + sorted(f"[{t}]" for t in (found | set(tags)))


class Screen:
    def __init__(self, sid, code, bg="#0C0F14", border="#1B2232"):
        self.sid, self.code = sid, code
        self.marker = f"§c§b§{code}§r"
        self.bg = box(bg, border)
        self.bg_col = bg
        self.static = []  # Img / Text on the canvas
        self.zones = []
        self.close = True

    def img(self, rect, texture):
        self.static.append(Img(rect, texture))
        return self

    def box(self, rect, fill, border=None, **kw):
        return self.img(rect, box(fill, border, **kw))

    def text(self, rect, text, **kw):
        self.static.append(Text(rect, text=text, **kw))
        return self

    def zone(self, *a, **kw):
        z = Zone(*a, **kw)
        self.zones.append(z)
        return z

    def back_button(self):
        """A small back arrow left of the close X. The script decides where it goes."""
        bk = (11, 11)
        self.zone("BACK", [W - 27, 2, bk[0], bk[1]], bk, Face(box("#1A202C", "#3A4458"), parts=[Img([1.5, 1.5, 8, 8], "textures/ui/cb/icon_back")]),
                  click=True)
        return self

    def layout(self):
        """What the script needs to know: which zone is the grid (its items go first,
        in cell order) and whether the screen has a back arrow."""
        grids = [z for z in self.zones if z.grid]
        assert len(grids) <= 1, self.sid
        g = grids[0] if grids else None
        return {"grid": g.tag if g else None, "gridSize": g.cols * g.rows if g else 0,
                "back": any(z.tag == "BACK" for z in self.zones)}


# ---------------------------------------------------------------------------
# JSON UI
# ---------------------------------------------------------------------------
NS = "cb_screens"
COLL = {"binding_collection_name": "form_buttons", "binding_type": "collection"}


def has(tag, prop="#form_button_text"):
    return f"(not (({prop} - '{tag}') = {prop}))"


def text_binding():
    return [{"binding_name": "#form_button_text", **COLL}]


def strip(tags):
    e = "#form_button_text"
    for t in tags:
        e = f"({e} - '{t}')"
    return e


def cond_expr(when):
    if when.startswith("!"):
        return f"(not {has('[' + when[1:] + ']')})"
    return has(f"[{when}]")


def vis(expr):
    return text_binding() + [{"binding_type": "view", "source_property_name": expr, "target_property_name": "#visible"}]


ANCHORS = {"top_left", "top_middle", "top_right", "left_middle", "center", "right_middle", "bottom_left", "bottom_middle", "bottom_right"}


def place(ctrl, rect, anchor="top_left"):
    x, y, w = rect[0], rect[1], rect[2]
    ctrl["anchor_from"] = "top_left"
    ctrl["anchor_to"] = "top_left"
    ctrl["offset"] = [x, y]
    if len(rect) > 3:
        ctrl["size"] = [w, rect[3]]
    return ctrl


def label_json(t, item_tags=None):
    d = {"type": "label", "layer": 6, "color": rgbf(t.color), "font_scale_factor": t.scale, "shadow": t.shadow,
         "text_alignment": {"left": "left", "center": "center", "right": "right"}[t.align]}
    if t.font:
        d["font_type"] = t.font
    if t.text is not None:
        d["text"] = t.text
    else:
        d["text"] = "#text"
        d["bindings"] = text_binding() + [{"binding_type": "view", "source_property_name": strip(item_tags), "target_property_name": "#text"}]
    if t.when:
        d.setdefault("bindings", text_binding())
        d["bindings"].append({"binding_type": "view", "source_property_name": cond_expr(t.when), "target_property_name": "#visible"})
    x, y, w = t.rect[:3]
    d["size"] = [w, "default"]
    a = t.anchor
    if a == "top_left":
        d.update(anchor_from="top_left", anchor_to="top_left", offset=[x, y])
    elif a == "left_middle":  # y = middle line
        d.update(anchor_from="top_left", anchor_to="left_middle", offset=[x, y])
    return d


def img_json(p, icon_ok=True):
    d = {"type": "image", "layer": 4}
    if p.texture:
        d["texture"] = p.texture
        binds = []
    else:
        binds = [
            {"binding_name": "#form_button_texture", "binding_name_override": "#texture", **COLL},
            {"binding_name": "#form_button_texture_file_system", "binding_name_override": "#texture_file_system", **COLL},
        ]
    exprs = []
    if not p.texture:
        exprs.append("(not ((#texture = '') or (#texture = 'loading')))")
    if p.when:
        exprs.append(cond_expr(p.when))
    if p.when:
        binds = text_binding() + binds
    if exprs:
        binds.append({"binding_type": "view", "source_property_name": " and ".join(f"({e})" for e in exprs) if len(exprs) > 1 else exprs[0], "target_property_name": "#visible"})
    if binds:
        d["bindings"] = binds
    place(d, p.rect)
    return d


def face_controls(face, tags, highlight=None):
    """The picture of one item: background (by state), pictures and text. With
    highlight, a hover glow is added on top (used for the button's hover look)."""
    ctrls = []
    if face.bg or face.states:
        others = [s for s, _ in face.states]
        if face.bg:
            expr = " and ".join(f"(not {has('[' + s + ']')})" for s in others) or "(true)"
            c = {"type": "image", "texture": face.bg, "size": ["100%", "100%"], "layer": 1}
            if others:
                c["bindings"] = vis(expr)
            ctrls.append({"bg": c})
        for i, (s, tex) in enumerate(face.states):
            earlier = " and ".join(f"(not {has('[' + e + ']')})" for e in others[:i])
            expr = has(f"[{s}]") + (f" and {earlier}" if earlier else "")
            ctrls.append({f"bg_{i}": {"type": "image", "texture": tex, "size": ["100%", "100%"], "layer": 1, "bindings": vis(f"({expr})")}})
    for i, p in enumerate(face.parts):
        ctrls.append({f"img_{i}": img_json(p)} if isinstance(p, Img) else {f"txt_{i}": label_json(p, tags)})
    if highlight:
        ctrls.append({"hl": {"type": "image", "texture": highlight, "size": ["100%", "100%"], "layer": 7}})
    return {"type": "panel", "size": ["100%", "100%"], "controls": ctrls}


CLICK = [
    {"from_button_id": "button.menu_select", "to_button_id": "button.form_button_click", "mapping_type": "pressed"},
    {"from_button_id": "button.menu_ok", "to_button_id": "button.form_button_click", "mapping_type": "focused"},
]


def zone_defs(scr, z):
    """One zone = the form buttons that carry its tag, drawn as a list (stack panel
    factory) or a grid. Built the way known to work in game (v3 and the tile menus):
      row/cell panel (hidden unless the button has this zone's tag)
        -> button, directly inside it, whose default/hover/pressed controls ARE the picture
    Grids also hide the button itself, because a grid shows its cells regardless."""
    base = f"{scr.sid}_{re.sub('[^a-z0-9]', '', z.tag.lower())}"
    defs = {}
    iw, ih = z.item
    gw = iw + (z.gap if z.orient == "horizontal" or z.grid else 0)
    gh = ih + (z.gap if z.orient == "vertical" or z.grid else 0)
    show = vis(has(f"[{z.tag}]"))
    face = base + "_face"
    defs[face] = face_controls(z.face, z.tags)
    at = {"size": [iw, ih], "anchor_from": "top_left", "anchor_to": "top_left"}
    if z.click:
        defs[face + "_hover"] = face_controls(z.face, z.tags, highlight=z.face.hover or box("#FFFFFF", "#FFFFFF", alpha=28))
        piece = {"button": dict(at, **{
            "type": "button",
            "default_control": "default", "hover_control": "hover", "pressed_control": "pressed",
            "sound_name": "random.click", "sound_volume": 1.0, "sound_pitch": 1.0, "button_mappings": CLICK,
            "bindings": ([] if not z.grid else show) + [{"binding_type": "collection_details", "binding_collection_name": "form_buttons"}],
            "controls": [{f"default@{NS}.{face}": {}}, {f"hover@{NS}.{face}_hover": {}},
                         {f"pressed@{NS}.{face}_hover": {"offset": [0, 0.5]}}]})}
    else:
        piece = {f"face@{NS}.{face}": dict(at, **({"bindings": show} if z.grid else {}))}
    defs[base + "_item"] = {"type": "panel", "size": [gw, gh], "bindings": show, "controls": [piece]}

    x, y, w, h = z.rect
    if z.grid:
        grid = {"type": "grid", "size": ["100%", "100%"], "anchor_from": "top_left", "anchor_to": "top_left",
                "grid_item_template": f"{NS}.{base}_item", "grid_dimensions": [z.cols, z.rows], "collection_name": "form_buttons",
                "bindings": [{"binding_name": "#form_button_length", "binding_name_override": "#maximum_grid_items"}]}
        return defs, place({"type": "panel", "controls": [{"grid": grid}]}, [x, y, w, h])
    stack = {"type": "stack_panel", "orientation": z.orient, "size": ["100%c", "100%c"],
             "factory": {"name": "buttons", "control_name": f"{NS}.{base}_item"}, "collection_name": "form_buttons",
             "bindings": [{"binding_name": "#form_button_length", "binding_name_override": "#collection_length"}],
             "anchor_from": z.align, "anchor_to": z.align}
    if z.scroll:
        stack.update(anchor_from="top_left", anchor_to="top_left")
        defs[base + "_content"] = stack
        return defs, place({"type": "panel", "controls": [{"scrolling_panel@common.scrolling_panel": {
            "anchor_to": "top_left", "anchor_from": "top_left", "$show_background": False, "size": ["100%", "100%"],
            "$scrolling_content": f"{NS}.{base}_content", "$scroll_size": [4, "100% - 2px"],
            "$scrolling_pane_size": ["100% - 2px", "100%"], "$scrolling_pane_offset": [0, 0],
            "$scroll_bar_right_padding_size": [0, 0]}}]}, [x, y, w, h])
    return defs, place({"type": "panel", "controls": [{"stack": stack}]}, [x, y, w, h])


def screen_json(scr):
    defs, ctrls = {}, []
    for i, p in enumerate(scr.static):
        ctrls.append({f"s{i}": img_json(p) if isinstance(p, Img) else label_json(p)})
    for z in scr.zones:
        d, c = zone_defs(scr, z)
        defs.update(d)
        ctrls.append({f"z_{re.sub('[^a-z0-9]', '', z.tag.lower())}": c})
    if scr.close:
        ctrls.append({"close@eco_form.close_button": {"size": [12, 12], "anchor_from": "top_right", "anchor_to": "top_right", "offset": [-2, 2], "layer": 8}})
    defs[scr.sid + "_screen"] = {"type": "image", "texture": scr.bg, "size": [W, H], "controls": ctrls}
    return defs


def scaled(node, k):
    """Multiplies every number in "offset" / "size" and every "font_scale_factor" by k."""
    if isinstance(node, dict):
        out = {}
        for key, v in node.items():
            if key in ("offset", "size") and isinstance(v, list):
                out[key] = [round(x * k, 2) if isinstance(x, (int, float)) and not isinstance(x, bool) else x for x in v]
            elif key == "font_scale_factor" and isinstance(v, (int, float)):
                out[key] = round(v * k, 3)
            else:
                out[key] = scaled(v, k)
        return out
    if isinstance(node, list):
        return [scaled(x, k) for x in node]
    return node


def write_ui(screens, path):
    ui = {"namespace": NS}
    for s in screens:
        ui.update(scaled(screen_json(s), SCALE))
    with open(path, "w") as f:
        f.write("// AUTO-GENERATED by tools/build_cloudbreak_screens.py - edit that instead.\n")
        json.dump(ui, f, indent=1, ensure_ascii=False)
    return ui


# ---------------------------------------------------------------------------
# Preview: draw a screen with sample buttons (same rules as the game)
# ---------------------------------------------------------------------------
MC = {"0": "#000000", "1": "#0000AA", "2": "#00AA00", "3": "#00AAAA", "4": "#AA0000", "5": "#AA00AA", "6": "#FFAA00",
      "7": "#AAAAAA", "8": "#555555", "9": "#5555FF", "a": "#55FF55", "b": "#55FFFF", "c": "#FF5555", "d": "#FF55FF",
      "e": "#FFFF55", "f": "#FFFFFF", "g": "#DDD605"}
PS = 4  # preview pixels per UI unit
_fonts = {}


def font(px, ten=False):
    key = (px, ten)
    if key not in _fonts:
        name = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if ten else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        _fonts[key] = ImageFont.truetype(name, max(6, int(px)))
    return _fonts[key]


# Minecraft font advance widths (UI units at scale 1), measured from the game.
NARROW = {"i": 2, "!": 2, ".": 2, ",": 2, ":": 2, ";": 2, "|": 2, "'": 2, "l": 3, "`": 3, "t": 4, "I": 4, " ": 4,
          "[": 4, "]": 4, "(": 4, ")": 4, "f": 5, "k": 5, "<": 5, ">": 5, "·": 2, "■": 6, "×": 6}


def adv(ch, ten):
    return 5.5 if ten else NARROW.get(ch, 6)  # MinecraftTen measured from "SKY SHOP" in game


def mc_width(s, scale, ten):
    return sum(adv(c, ten) for c in s) * scale


def draw_text(d, t, text, ox, oy):
    """Minecraft-sized text: game letter widths, 10-unit lines, § colours, word wrap at the label width."""
    if not text:
        return
    ten = bool(t.font)
    scale = t.scale
    line_h = 10 * scale
    fnt = font(7.2 * scale * PS, ten)
    x, y, w = t.rect[0], t.rect[1], t.rect[2]
    lines = []
    for raw in text.split("\n"):
        col = t.color
        segs, cur = [], ""
        i = 0
        while i < len(raw):
            if raw[i] == "§" and i + 1 < len(raw):
                if cur:
                    segs.append((cur, col))
                    cur = ""
                c = raw[i + 1]
                col = MC.get(c, t.color) if c != "r" else t.color
                i += 2
                continue
            cur += raw[i]
            i += 1
        if cur:
            segs.append((cur, col))
        words = []
        for sg, c in segs:
            for wd in re.split(r"(\s+)", sg):
                if wd:
                    words.append((wd, c))
        line, lw = [], 0
        for wd, c in words:
            ww = mc_width(wd, scale, ten)
            if lw + ww > w + 0.01 and line and not wd.isspace():
                lines.append(line)
                line, lw = [], 0
            if not line and wd.isspace():
                continue
            line.append((wd, c))
            lw += ww
        lines.append(line)
    total = len(lines) * line_h
    sy = oy + y
    if t.anchor == "left_middle":
        sy -= total / 2
    if len(lines) > 1 and getattr(t, "max_lines", 99) < len(lines):
        print(f"WARNING: text wraps to {len(lines)} lines: {text!r}")
    for li, line in enumerate(lines):
        lw = sum(mc_width(wd, scale, ten) for wd, _ in line)
        cx = ox + x
        if t.align == "center":
            cx += (w - lw) / 2
        elif t.align == "right":
            cx += w - lw
        for wd, c in line:
            for ch in wd:
                d.text((cx * PS, (sy + li * line_h) * PS), ch, font=fnt, fill=hexc(c)[:3])
                cx += adv(ch, ten) * scale


_texcache = {}


def tex_img(path):
    """Load a generated or pack texture (no extension in path)."""
    if path not in _texcache:
        full = os.path.join(RP, path + ".png")
        if not os.path.exists(full):
            _texcache[path] = None
        else:
            im = Image.open(full).convert("RGBA")
            j = full[:-4] + ".json"
            ns = json.load(open(j)).get("nineslice_size") if os.path.exists(j) else None
            _texcache[path] = (im, ns)
    return _texcache[path]


def paste_tex(canvas, path, x, y, w, h):
    t = tex_img(path)
    if not t or w <= 0 or h <= 0:
        return
    im, ns = t
    W2, H2 = max(1, int(w * PS)), max(1, int(h * PS))
    if ns:
        # nine-slice: scale corners by PS, stretch the middle
        n = ns
        c = n * PS
        out = Image.new("RGBA", (W2, H2))
        iw, ih = im.size
        parts = {
            (0, 0): (0, 0, n, n), (1, 0): (n, 0, iw - n, n), (2, 0): (iw - n, 0, iw, n),
            (0, 1): (0, n, n, ih - n), (1, 1): (n, n, iw - n, ih - n), (2, 1): (iw - n, n, iw, ih - n),
            (0, 2): (0, ih - n, n, ih), (1, 2): (n, ih - n, iw - n, ih), (2, 2): (iw - n, ih - n, iw, ih),
        }
        xs = [0, c, max(c, W2 - c), W2]
        ys = [0, c, max(c, H2 - c), H2]
        for (cx, cy), crop in parts.items():
            dw, dh = xs[cx + 1] - xs[cx], ys[cy + 1] - ys[cy]
            if dw > 0 and dh > 0:
                out.paste(im.crop(crop).resize((dw, dh), Image.NEAREST), (xs[cx], ys[cy]))
        im2 = out
    else:
        im2 = im.resize((W2, H2), Image.NEAREST)
    canvas.alpha_composite(im2, (int(x * PS), int(y * PS)))


def has_tag(text, tag):
    return f"[{tag}]" in text


def strip_tags(text, tags):
    for t in tags:
        text = text.replace(t, "")
    return text


def draw_face(canvas, d, z, text, icon, x, y):
    face = z.face
    iw, ih = z.item
    bg = face.bg
    for s, tex in face.states:
        if has_tag(text, s):
            bg = tex
            break
    if bg:
        paste_tex(canvas, bg, x, y, iw, ih)
    clean = strip_tags(text, z.tags)
    if re.search(r"\[[A-Za-z0-9]+\]", clean):
        print(f"WARNING: zone {z.tag}: a tag would show as text: {clean!r}")
    for p in face.parts:
        if isinstance(p, Img):
            if p.when and (has_tag(text, p.when[1:]) if p.when.startswith("!") else not has_tag(text, p.when)):
                continue
            path = p.texture or icon
            if path:
                paste_tex(canvas, path, x + p.rect[0], y + p.rect[1], p.rect[2], p.rect[3])
        else:
            if p.when and (has_tag(text, p.when[1:]) if p.when.startswith("!") else not has_tag(text, p.when)):
                continue
            draw_text(d, p, p.text if p.text is not None else clean, x, y)


def preview(scr, form, out):
    """form = {"title": str, "buttons": [{"text", "icon"}]} as sent by the script."""
    canvas = Image.new("RGBA", (W * PS, H * PS), (30, 40, 60, 255))
    paste_tex(canvas, scr.bg, 0, 0, W, H)
    d = ImageDraw.Draw(canvas)
    for p in scr.static:
        if isinstance(p, Img):
            paste_tex(canvas, p.texture, *p.rect)
        else:
            draw_text(d, p, p.text, 0, 0)
    btns = form["buttons"]
    for z in scr.zones:
        items = [b for b in btns if has_tag(b["text"], z.tag)]
        x0, y0, zw, zh = z.rect
        iw, ih = z.item
        if z.grid:
            cols = z.cols
            idx = 0
            for b in btns:  # holes for untagged buttons, like the game
                if has_tag(b["text"], z.tag):
                    cx = x0 + (idx % cols) * (iw + z.gap)
                    cy = y0 + (idx // cols) * (ih + z.gap)
                    if idx < z.cols * z.rows:
                        draw_face(canvas, d, z, b["text"], b.get("icon"), cx, cy)
                idx += 1
            continue
        step_w = iw + (z.gap if z.orient == "horizontal" else 0)
        step_h = ih + (z.gap if z.orient == "vertical" else 0)
        tw = step_w * len(items) if z.orient == "horizontal" else iw
        th = step_h * len(items) if z.orient == "vertical" else ih
        if "middle" in z.align or z.align == "center":
            sx = x0 + (zw - tw) / 2 if z.align in ("top_middle", "center", "bottom_middle") else x0
        elif "right" in z.align:
            sx = x0 + zw - tw
        else:
            sx = x0
        if z.align.startswith("bottom"):
            sy = y0 + zh - th
        elif z.align in ("center", "left_middle", "right_middle"):
            sy = y0 + (zh - th) / 2
        else:
            sy = y0
        for i, b in enumerate(items):
            cx = sx + (i * step_w if z.orient == "horizontal" else 0)
            cy = sy + (i * step_h if z.orient == "vertical" else 0)
            if z.scroll and cy + ih > y0 + zh + 0.5:
                break
            draw_face(canvas, d, z, b["text"], b.get("icon"), cx, cy)
    if scr.close:
        paste_tex(canvas, "textures/ui/eco/close", W - 14, 2, 12, 12)
    canvas.convert("RGB").save(out)
