# Factions Economy (Minecraft Bedrock)

An economy add-on for Bedrock factions realms. Players use a **Menu Compass** to open
custom-styled menus: dark panels, coloured header bars, icon tiles and NEW!/HOT! badges.

![Shop menu preview](docs/preview.png)
*(mock-up made from the real textures)*

## Features

| Compass menu | What it does |
|---|---|
| **Shop** | Categories: **Blocks, Food, Kits, Spawners, Farming**. Buy x1/x8/x16/x32/x64 |
| **Sell** | Sell ores, mob drops & crops. Sell one type or *Sell All* |
| **Balance** | Your money + leaderboard rank |
| **Pay** | Send money to online players (presets, All, or a custom amount) |
| **Baltop** | Top 10 richest players (offline players included) |
| **Admin** | Only for players tagged `admin`: add/remove/set money, give compasses |

- Money is stored on the `money` **scoreboard**, so it survives restarts and works on Realms.
- **Kits** have per-player cooldowns and support enchantments.
- **Spawners** come pre-set to their mob. Mining one with **Silk Touch** gives it back
  (configurable).
- The compass is given on join, kept on death, and can't be dropped or stored.
- Only forms from this add-on get the custom look. Other add-ons' menus stay vanilla.

## Install

1. Run `./tools/build.sh`. It creates `dist/FactionsEconomy.mcaddon`.
2. Open the `.mcaddon` file to import it into Minecraft.
3. Make a world (or edit your realm's world). Add **both** the behaviour pack and the resource pack.
4. No experimental toggles are needed. It uses the stable Script API (`@minecraft/server` 2.0.0, game 1.21.90+).
5. Realms: apply the packs to a local copy of the world, then *Replace World* on the realm.

## Commands

```
/tag <player> add admin                    give someone the Admin tile
/scoreboard players add <player> money 1000
/scoreboard objectives setdisplay sidebar money   show balances on the sidebar
/scriptevent eco:compass                   give yourself a compass
/execute as @p run scriptevent eco:menu    open the menu (e.g. from an NPC/command block)
```

## Customising

- **Prices, items, kits, spawners, sell prices:** `packs/FactionsEconomy_BP/scripts/config.js`
- **Server name above the menu:** `$eco_server_name` / `$eco_server_tag` in
  `packs/FactionsEconomy_RP/ui/eco_form.json`
- **Colours / textures / icons:** edit `tools/generate_assets.py`, then run
  `python3 tools/generate_assets.py` (needs `pip install pillow`)
- **Menu theme per category:** the `theme` field in config (`red`, `gold`, `green`,
  `blue`, `purple`, `orange`)
- **Badges:** add `badge: "NEW"` or `badge: "HOT"` to any category, item, kit or spawner
- **New spawner mob:** add it to `spawners` in config.js and to `SPAWNER_MOBS` in
  `generate_assets.py`, then re-run the generator

## How the custom UI works

`ui/server_form.json` replaces the action-form layout. If a form's title starts with the
hidden marker `§e§c§o§<theme>§r`, the custom layout from `ui/eco_form.json` is used.
Otherwise the vanilla one is. Each button's text, icon and badge come from the script,
so new menus are just `tileMenu(player, { title, theme, body, tiles })` in `scripts/ui.js`.
