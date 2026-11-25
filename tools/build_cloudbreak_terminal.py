"""Builds packs/Cloudbreak_RP/ui/cb_terminal.json: the Core Terminal screen.

The script (menus.js coreTerminal) sends an action form whose title starts
with "§c§t§m§r". Buttons are tagged so each lands in its own spot:
  [MOD] module card (grid)   [DEP] deposit button (left panel)
  [TAB] bottom tab ([ON] = the open tab)   [HDR] the line above the cards
The title holds the clan line plus [ON] or [DOWN] for the shield badge.
   python3 tools/build_cloudbreak_terminal.py
"""
import json
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "packs", "Cloudbreak_RP", "ui", "cb_terminal.json")
T = "textures/ui/cb/"
MARK = "§c§t§m§r"
TAGS = ["[MOD]", "[DEP]", "[TAB]", "[ON]", "[HDR]"]


def strip(expr, tags):
    for t in tags:
        expr = f"({expr} - '{t}')"
    return expr


def has(tag, prop="#form_button_text"):
    return f"(not (({prop} - '{tag}') = {prop}))"


def item_visible(tag, extra=None):
    cond = has(tag) if not extra else f"({has(tag)} and {extra})"
    return [
        {"binding_name": "#form_button_text", "binding_type": "collection", "binding_collection_name": "form_buttons"},
        {"binding_type": "view", "source_property_name": cond, "target_property_name": "#visible"},
    ]


BUTTON_TEXT = [
    {"binding_name": "#form_button_text", "binding_type": "collection", "binding_collection_name": "form_buttons"},
    {"binding_type": "view", "source_property_name": strip("#form_button_text", TAGS), "target_property_name": "#text"},
]

CLICK = [
    {"from_button_id": "button.menu_select", "to_button_id": "button.form_button_click", "mapping_type": "pressed"},
    {"from_button_id": "button.menu_ok", "to_button_id": "button.form_button_click", "mapping_type": "focused"},
]


def button(face, faces):
    """A form button: faces = (default texture, hover texture)."""
    return {
        "type": "button", "size": ["100%", "100%"],
        "default_control": "default", "hover_control": "hover", "pressed_control": "pressed",
        "sound_name": "random.click", "sound_volume": 1.0, "sound_pitch": 1.0,
        "button_mappings": CLICK,
        "bindings": [{"binding_type": "collection_details", "binding_collection_name": "form_buttons"}],
        "controls": [
            {"default@cb_terminal." + face: {"$bg": T + faces[0]}},
            {"hover@cb_terminal." + face: {"$bg": T + faces[1]}},
            {"pressed@cb_terminal." + face: {"$bg": T + faces[1], "offset": [0, 1]}},
        ],
    }


def label(text, scale=0.75, color=(1, 1, 1), **kw):
    d = {"type": "label", "text": text, "font_scale_factor": scale, "color": list(color), "shadow": False, "layer": 3}
    d.update(kw)
    return d


def collection_stack(orientation, template, size):
    return {
        "type": "stack_panel", "orientation": orientation, "size": size,
        "factory": {"name": "buttons", "control_name": "cb_terminal." + template},
        "collection_name": "form_buttons",
        "bindings": [{"binding_name": "#form_button_length", "binding_name_override": "#collection_length"}],
    }


title_text = strip("#title_text", [MARK, "[ON]", "[DOWN]"])

ui = {
    "namespace": "cb_terminal",

    # ---- whole screen ------------------------------------------------------
    "terminal_screen": {
        "type": "image", "texture": T + "term_bg", "size": [384, 238],
        "controls": [{"layout": {
            "type": "stack_panel", "orientation": "vertical", "size": ["100% - 10px", "100% - 10px"],
            "controls": [
                {"header@cb_terminal.header": {}},
                {"gap1": {"type": "panel", "size": ["100%", 5]}},
                {"body@cb_terminal.body": {}},
                {"gap2": {"type": "panel", "size": ["100%", 5]}},
                {"tabs@cb_terminal.tabs": {}},
            ],
        }}],
    },

    # ---- header bar: square, CORE TERMINAL, clan line, shield badge, close --
    "header": {
        "type": "image", "texture": T + "term_box", "size": ["100%", 24],
        "controls": [
            {"square": {"type": "image", "texture": T + "term_square", "size": [9, 9], "anchor_from": "left_middle", "anchor_to": "left_middle", "offset": [7, 0], "layer": 2}},
            {"name": label("CORE TERMINAL", 1.0, font_type="MinecraftTen", anchor_from="left_middle", anchor_to="left_middle", offset=[21, 1], shadow=True)},
            {"clan": label("#text", 0.75, (0.56, 0.61, 0.71), anchor_from="left_middle", anchor_to="left_middle", offset=[112, 1], size=[150, "default"],
                           bindings=[{"binding_name": "#title_text"}, {"binding_type": "view", "source_property_name": title_text, "target_property_name": "#text"}])},
            {"shield_on": {"type": "image", "texture": T + "term_chip_on", "size": [64, 14], "anchor_from": "right_middle", "anchor_to": "right_middle", "offset": [-26, 0], "layer": 2,
                           "bindings": [{"binding_name": "#title_text"}, {"binding_type": "view", "source_property_name": has("[ON]", "#title_text"), "target_property_name": "#visible"}],
                           "controls": [{"t": label("SHIELD ONLINE", 0.6, (0.24, 0.86, 0.59))}]}},
            {"shield_off": {"type": "image", "texture": T + "term_chip_off", "size": [64, 14], "anchor_from": "right_middle", "anchor_to": "right_middle", "offset": [-26, 0], "layer": 2,
                            "bindings": [{"binding_name": "#title_text"}, {"binding_type": "view", "source_property_name": has("[DOWN]", "#title_text"), "target_property_name": "#visible"}],
                            "controls": [{"t": label("SHIELD DOWN", 0.6, (1, 0.35, 0.31))}]}},
            {"close@eco_form.close_button": {"size": [18, 18], "anchor_from": "right_middle", "anchor_to": "right_middle", "offset": [-3, 0], "layer": 3}},
        ],
    },

    # ---- body: core panel on the left, module cards on the right -----------
    "body": {
        "type": "stack_panel", "orientation": "horizontal", "size": ["100%", "fill"],
        "controls": [
            {"core@cb_terminal.core_panel": {}},
            {"gap": {"type": "panel", "size": [5, "100%"]}},
            {"modules@cb_terminal.modules": {}},
        ],
    },

    "core_panel": {
        "type": "image", "texture": T + "term_box", "size": [112, "100%"],
        "controls": [
            {"art": {"type": "image", "texture": T + "term_core", "size": [44, 44], "anchor_from": "top_middle", "anchor_to": "top_middle", "offset": [0, 6], "layer": 2}},
            {"stats": label("#form_text", 0.75, (0.9, 0.93, 0.97), anchor_from="top_middle", anchor_to="top_middle", offset=[0, 55], size=["100% - 12px", "default"],
                            text_alignment="left", bindings=[{"binding_name": "#form_text"}])},
            {"deposit": dict(collection_stack("vertical", "deposit_item", ["100% - 12px", "100%c"]),
                             anchor_from="bottom_middle", anchor_to="bottom_middle", offset=[0, -6], layer=2)},
        ],
    },
    "deposit_item": {
        "type": "panel", "size": ["100%", 20], "bindings": item_visible("[DEP]"),
        "controls": [{"button": button("deposit_face", ("term_deposit", "term_deposit_hover"))}],
    },
    "deposit_face": {
        "type": "image", "texture": "$bg", "size": ["100%", "100%"],
        "controls": [{"text": label("#text", 0.8, (0.1, 0.08, 0.05), font_type="MinecraftTen", bindings=BUTTON_TEXT)}],
    },

    "modules": {
        "type": "stack_panel", "orientation": "vertical", "size": ["fill", "100%"],
        "controls": [
            {"hdr": collection_stack("vertical", "hdr_item", ["100%", "100%c"])},
            {"gap": {"type": "panel", "size": ["100%", 3]}},
            {"scroll": {"type": "panel", "size": ["100%", "fill"], "controls": [{"scrolling_panel@common.scrolling_panel": {
                "anchor_to": "top_left", "anchor_from": "top_left", "$show_background": False, "size": ["100%", "100%"],
                "$scrolling_content": "cb_terminal.cards", "$scroll_size": [5, "100% - 4px"],
                "$scrolling_pane_size": ["100% - 4px", "100% - 2px"], "$scrolling_pane_offset": [0, 0],
                "$scroll_bar_right_padding_size": [0, 0],
            }}]}},
        ],
    },
    "hdr_item": {
        "type": "panel", "size": ["100%", 12], "bindings": item_visible("[HDR]"),
        "controls": [{"text": label("#text", 0.8, anchor_from="left_middle", anchor_to="left_middle", offset=[2, 0], size=["100% - 4px", "default"], bindings=BUTTON_TEXT)}],
    },
    "cards": {
        "type": "stack_panel", "orientation": "vertical", "size": ["100% - 6px", "100%c"],
        "anchor_from": "top_left", "anchor_to": "top_left",
        "controls": [{"grid": {
            "type": "grid", "size": ["100%", "default"], "anchor_from": "top_left", "anchor_to": "top_left",
            "grid_item_template": "cb_terminal.card_item", "grid_rescaling_type": "horizontal", "collection_name": "form_buttons",
            "bindings": [{"binding_name": "#form_button_length", "binding_name_override": "#maximum_grid_items"}],
        }}],
    },
    "card_item": {
        "type": "panel", "size": [121, 54], "bindings": item_visible("[MOD]"),
        "controls": [{"button": dict(button("card_face", ("term_card", "term_card_hover")), size=["100% - 3px", "100% - 3px"])}],
    },
    "card_face": {
        "type": "image", "texture": "$bg", "size": ["100%", "100%"],
        "controls": [
            {"icon": {"type": "image", "size": [12, 12], "layer": 2, "anchor_from": "top_right", "anchor_to": "top_right", "offset": [-4, 4],
                      "bindings": [
                          {"binding_name": "#form_button_texture", "binding_type": "collection", "binding_collection_name": "form_buttons", "binding_name_override": "#texture"},
                          {"binding_name": "#form_button_texture_file_system", "binding_type": "collection", "binding_collection_name": "form_buttons", "binding_name_override": "#texture_file_system"},
                          {"binding_type": "view", "source_property_name": "(not ((#texture = '') or (#texture = 'loading')))", "target_property_name": "#visible"},
                      ]}},
            {"text": label("#text", 0.7, anchor_from="top_left", anchor_to="top_left", offset=[5, 5], size=["100% - 10px", "default"],
                           text_alignment="left", bindings=BUTTON_TEXT)},
        ],
    },

    # ---- bottom tabs --------------------------------------------------------
    "tabs": dict(collection_stack("horizontal", "tab_item", ["100%c", 18]), anchor_from="center", anchor_to="center"),
    "tab_item": {
        "type": "panel", "size": [70, 18], "bindings": item_visible("[TAB]"),
        "controls": [
            {"active": {"type": "panel", "size": ["100% - 4px", "100%"], "bindings": item_visible("[ON]"),
                        "controls": [{"button": button("tab_face", ("term_tab_on", "term_tab_on"))}]}},
            {"idle": {"type": "panel", "size": ["100% - 4px", "100%"],
                      "bindings": item_visible("[TAB]", "((#form_button_text - '[ON]') = #form_button_text)"),
                      "controls": [{"button": button("tab_face", ("term_tab", "term_tab_hover"))}]}},
        ],
    },
    "tab_face": {
        "type": "image", "texture": "$bg", "size": ["100%", "100%"],
        "controls": [{"text": label("#text", 0.7, (0.72, 0.77, 0.85), bindings=BUTTON_TEXT)}],
    },
}

with open(OUT, "w") as f:
    f.write("// AUTO-GENERATED by tools/build_cloudbreak_terminal.py - edit that instead.\n")
    json.dump(ui, f, indent=2, ensure_ascii=False)
print("Built ui/cb_terminal.json")
