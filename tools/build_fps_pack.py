"""Builds packs/FPSBoost_RP and dist/FPSBoost.mcpack (run: python3 tools/build_fps_pack.py)."""
import json, os, shutil, uuid, zipfile
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, "packs", "FPSBoost_RP")
DIST = os.path.join(ROOT, "dist")

# Fixed UUIDs so updating the pack replaces the old one instead of adding a copy.
HEADER_UUID = "6f3c2a1e-8b4d-4c7a-9e21-5d0f7b3a9c41"
MODULE_UUID = "a2d9e47b-1c3f-4e8a-b6d5-0f9e8c7b6a52"

def png(path, img):
    full = os.path.join(PACK, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full, optimize=True)

def write_json(path, data):
    full = os.path.join(PACK, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        json.dump(data, f, indent=2)

readme = None
rp = os.path.join(PACK, "README.md")
if os.path.exists(rp):
    readme = open(rp).read()
shutil.rmtree(PACK, ignore_errors=True)
if readme:
    os.makedirs(PACK)
    open(rp, "w").write(readme)

write_json("manifest.json", {
    "format_version": 2,
    "header": {
        "name": "§aFPS Boost",
        "description": "Lighter menus + fewer particles for low-end PCs",
        "uuid": HEADER_UUID,
        "version": [1, 0, 0],
        "min_engine_version": [1, 20, 0],
    },
    "modules": [{"type": "resources", "uuid": MODULE_UUID, "version": [1, 0, 0]}],
})

# Icon: green "FPS" badge.
icon = Image.new("RGBA", (64, 64), (24, 28, 32, 255))
d = ImageDraw.Draw(icon)
d.rectangle([4, 4, 59, 59], outline=(80, 220, 100, 255), width=3)
for i, h in enumerate([14, 24, 34, 44]):          # rising bar chart
    x = 12 + i * 11
    d.rectangle([x, 52 - h, x + 7, 52], fill=(80, 220, 100, 255))
png("pack_icon.png", icon)

# 1) Main-menu panorama: tiny flat images instead of six big screenshots.
for i in range(6):
    shade = (22, 26, 34) if i != 4 else (30, 36, 46)   # 4 = top face
    png(f"textures/ui/panorama_{i}.png", Image.new("RGB", (16, 16), shade))
png("textures/ui/panorama_overlay.png", Image.new("RGBA", (16, 16), (0, 0, 0, 0)))

# 2) Full-screen overlays drawn every frame -> fully transparent and tiny.
clear = Image.new("RGBA", (4, 4), (0, 0, 0, 0))
for p in ["textures/misc/vignette.png",
          "textures/misc/pumpkinblur.png",
          "textures/environment/clouds.png"]:
    png(p, clear)

# 3) Particles that spawn a lot and cost frames -> emit nothing.
NO_PARTICLES = [
    "minecraft:campfire_smoke_particle",
    "minecraft:campfire_tall_smoke_particle",
    "minecraft:basic_smoke_particle",
    "minecraft:rain_splash_particle",
    "minecraft:falling_dust",
    "minecraft:falling_dust_dragon_egg_particle",
    "minecraft:falling_dust_sand_particle",
    "minecraft:falling_dust_red_sand_particle",
    "minecraft:falling_dust_gravel_particle",
    "minecraft:falling_dust_concrete_powder_particle",
    "minecraft:falling_dust_scaffolding_particle",
    "minecraft:falling_dust_top_snow_particle",
    "minecraft:lava_particle",
    "minecraft:dripstone_lava_drip_particle",
    "minecraft:dripstone_water_drip_particle",
    "minecraft:spore_blossom_ambient_particle",
    "minecraft:spore_blossom_shower_particle",
    "minecraft:cherry_leaves_particle",
    "minecraft:pale_oak_leaves_particle",
    "minecraft:falling_border_dust_particle",
    "minecraft:sculk_soul_particle",
    "minecraft:sculk_charge_particle",
    "minecraft:sculk_charge_pop_particle",
    "minecraft:sculk_sensor_redstone_particle",
    "minecraft:shriek_particle",
    "minecraft:sonic_explosion",
    "minecraft:villager_happy",
    "minecraft:villager_angry",
    "minecraft:heart_particle",
    "minecraft:note_particle",
    "minecraft:enchanting_table_particle",
    "minecraft:portal_directional",
    "minecraft:portal_east_west",
    "minecraft:portal_north_south",
    "minecraft:portal_reverse_particle",
    "minecraft:end_chest",
    "minecraft:soul_particle",
    "minecraft:ash",
    "minecraft:white_ash",
    "minecraft:basalt_deltas_ash",
    "minecraft:warped_spore",
    "minecraft:crimson_spore",
    "minecraft:mycelium_dust_particle",
    "minecraft:obsidian_glow_dust_particle",
    "minecraft:huge_explosion_emitter",
    "minecraft:huge_explosion_lab_misc_emitter",
    "minecraft:large_explosion",
    "minecraft:explosion_particle",
    "minecraft:knockback_roar_particle",
    "minecraft:totem_particle",
    "minecraft:totem_manual",
    "minecraft:wax_particle",
    "minecraft:electric_spark_particle",
    "minecraft:glow_particle",
    "minecraft:ink_emitter",
    "minecraft:squid_ink_bubble",
    "minecraft:dolphin_move_particle",
    "minecraft:breaking_item_icon",
    "minecraft:breaking_item_terrain",
    "minecraft:sneeze",
]
for ident in NO_PARTICLES:
    write_json(f"particles/{ident.split(':')[1]}.json", {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": ident,
                "basic_render_parameters": {
                    "material": "particles_alpha",
                    "texture": "textures/particle/particles",
                },
            },
            "components": {
                "minecraft:emitter_rate_instant": {"num_particles": 0},
                "minecraft:emitter_lifetime_once": {"active_time": 0},
                "minecraft:emitter_shape_point": {},
                "minecraft:particle_lifetime_expression": {"max_lifetime": 0},
                "minecraft:particle_appearance_billboard": {
                    "size": [0, 0], "facing_camera_mode": "rotate_xyz",
                },
            },
        },
    })

os.makedirs(DIST, exist_ok=True)
out = os.path.join(DIST, "FPSBoost.mcpack")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for base, _, files in os.walk(PACK):
        for f in sorted(files):
            full = os.path.join(base, f)
            z.write(full, os.path.relpath(full, PACK))
print("built", out, os.path.getsize(out), "bytes")
