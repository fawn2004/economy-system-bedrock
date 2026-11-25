# Cloudbreak — Sky Clans

Clans of up to 5 share a floating island, grind it up like skyblock, and buy blind raids on
other islands. The full design is in the Cloudbreak design doc; the UI mockups are on the
Cloudbreak UI canvas.

Packs: `packs/Cloudbreak_BP` and `packs/Cloudbreak_RP` (version 0.4.0). Cloudbreak contains its
own copy of the Skyblock Economy code (`scripts/eco`), so it does **not** need the Skyblock
Economy packs. Don't run both in the same world.

## Status

All six milestones are built. Nothing has been tested in Minecraft yet; the rules are covered by
offline tests (`tools/cloudbreak_tests/run.sh`).

| Milestone | What |
| --- | --- |
| 1 | Clans (Owner / Co-Owner / Member, max 5) and islands on a void grid |
| 2 | Island Core, hourly core tax, 9 core upgrades, clan bank |
| 3 | Raids: Normal, Intel, Cheap, Revenge; bridge, lives, loot, cleanup |
| 4 | Raid immunity, insurance, revenge, raid log, leaderboards, crate keys |
| 5 | Sky Shop, crates (reel animation), kits |
| 6 | Styled menus with icons, Core Monitor sidebar, raid sidebars, admin Control Room |
| 0.3 | Every menu rebuilt as its own screen from the chosen mockup (Elevator Tower, Core Terminal, Raid Dispatch, Insurance Vault, Sky Shop, Crate Opening, Raid Log, Leaderboards, Chain of Command, Coin Tower, Levers, Control Room) |
| + | Economy merged in; 10 new minions with their own models |

## Install

1. Run `tools/build_cloudbreak.sh` and open `dist/Cloudbreak_v<version>.mcaddon`.
2. Make a **void world** (Flat world, "The Void" preset). Islands are built at y = 100 from
   x = 20,000, z = 20,000, 1,000 blocks apart.
3. Turn on **Education Edition** in the world settings (needed for Island Fly).
4. Turn on both Cloudbreak packs. Needs **Minecraft 1.26.10 or newer** (Script API 2.6.0).
5. Make sure PvP is on in the world settings; Cloudbreak itself blocks player damage outside raids.
6. Give staff the admin tag: `/tag <name> add admin`.
7. Optional: put your server address in `sidebarFooter` in `scripts/config.js`.

## Commands

```
/menu                       Cloudbreak menu (also the Cloudbreak Menu item, slot 9)
/is                         teleport to your island
/sc create <name>           create a clan and its island
/sc invite <player>         invite an online player (Owner, Co-Owner)
/sc accept | decline        answer your latest invite
/sc leave                   leave your clan
/sc kick <player>           kick a member below your role (Owner, Co-Owner)
/sc promote <player>        Member -> Co-Owner (Owner, Co-Owner)
/sc demote <player>         Co-Owner -> Member (Owner)
/sc transfer <player>       make someone the Owner (Owner)
/sc disband                 delete the clan (Owner)
/sc raid                    open Raid Dispatch
/sc back                    back out of a raid in the first 30 seconds (50% refund)
/admin                      admin Control Room (players tagged admin)
/scriptevent cb:menu        open the menu from NPCs / command blocks (/execute as)
/scriptevent cb:item        get the menu item back
```

If another addon already uses one of these names, add the namespace: `/cb:menu`, `/cb:is`,
`/cb:sc`, `/cb:admin`.

## How it plays

- **Islands:** 15×15 starter island inside a 100×100 border (Island Size grows it to 300×300).
  The 9×9 stone-brick spawn zone can't be broken or built on; chests there still open and
  spawners can still be picked up. You can only build on your own island.
- **Island Core:** tap it for the Core Terminal. It charges $10,000 from the clan bank for every
  hour a member is online. If the bank can't pay: a 30-minute grace, then the shield drops, all
  upgrades switch off and the island shows up in Cheap Raids. Paying brings everything back.
- **Upgrades:** Island Size, Sell Multiplier (up to x3, every sell), Island Fly, Ore Generator
  (cobblestone generators sometimes make ores), Spawner Cap (10 → 50), Crop Growth (up to x3),
  Raid Shield Length, Defence Time (raiders get less time to reach you), Extra Raid Life.
- **Raids:** bought by the Owner or a Co-Owner. Everyone online goes to a launch island 60 blocks
  out and has 10 minutes to bridge across. Landing wins: 25% of the target's bank (+50% from the
  server if the raiders' clan is poorer), then 15 minutes of looting. Failing pays the raid fee to
  the defenders. 3 lives each. PvP only works between players in a raid. Intel Raids show a hint
  first (free to scout, once a minute) and you only pay if you deploy.
- **After a raid:** the raided clan gets 12h immunity, its insurance payout and a 24h Revenge
  Raid. Winners get Raider Crate keys, defenders get Defender Crate keys (kept for you if you were
  offline).
- **Admins:** every rule above can be changed in /admin → (an admin-tagged player) → Server Rules.

## Tools

```
tools/build_cloudbreak.sh            build the .mcaddon
tools/build_cloudbreak_minions.py    rebuild minion models, entities, loot items, minion_types.js
tools/build_cloudbreak_ui.py         rebuild icons, menu header themes, sidebar panels, terminal textures
tools/build_cloudbreak_screens.py    rebuild every menu screen from the chosen mockups (ui/cb_screens.json)
tools/cloudbreak_tests/preview/run.sh   draw every screen from the real menu code (dist/previews)
tools/cloudbreak_tests/run.sh        offline rule tests (no Minecraft needed)
```

## Test checklist (in game)

- [ ] Create a clan: island, core and respawn point appear; invite/kick/promote/transfer/disband
- [ ] Spawn zone rules; can't build outside the border or on other islands; admins can
- [ ] Deposit / withdraw; tax after an hour online; grace → shield down → deposit restores
- [ ] Each upgrade works (Island Fly needs Education Edition)
- [ ] Raid: launch island, back out, bridge, defenders warned + sidebar, lives, landing, 25%,
      loot 15 min, cleanup; defended raid pays the fee; logging off / restart mid-raid
- [ ] Insurance payout, immunity, revenge, raid log, leaderboards, crate keys and crate reel
- [ ] Sky Shop categories, Sell with multiplier, minions (all 10 models), chunk hopper
- [ ] Admin panel: normal vs admin-tagged player, Server Rules saved after restart
