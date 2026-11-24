# Cloudbreak — Sky Clans

Clans of up to 5 share a floating island and (from Milestone 3) buy blind raids on other islands.
The full design is in the Cloudbreak design doc; the UI mockups are on the Cloudbreak UI canvas.

Packs: `packs/Cloudbreak_BP` and `packs/Cloudbreak_RP`. They run alongside the Skyblock Economy packs.

## Status

| Milestone | What | State |
| --- | --- | --- |
| 1 | Clans and islands | **Built (v0.1.0)** — needs in-game testing |
| 2 | Island Core and clan bank | Not started |
| 3 | Raids | Not started |
| 4 | After the raid (insurance, revenge, logs, keys) | Not started |
| 5 | Shop, crates and kits | Not started |
| 6 | Custom menus, sidebar, admin panel | Not started |

Milestone 1 uses plain Bedrock forms; the chosen custom layouts come in Milestone 6.

## Install

1. Run `tools/build_cloudbreak.sh` and open `dist/Cloudbreak_v<version>.mcaddon`.
2. Make a **void world** (Flat world with the "The Void" preset, or any world with nothing far out
   at x/z 20,000+). Islands are built at y = 100 from x = 20,000, z = 20,000, 1,000 blocks apart.
3. Turn on both Cloudbreak packs. Needs Minecraft 1.21.100 or newer (Script API 2.1.0).

## Commands

```
/menu                       open the Cloudbreak menu (also: the Cloudbreak Menu item, slot 9)
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
/scriptevent cb:menu        open the menu from NPCs / command blocks (/execute as)
/scriptevent cb:item        get the menu item back
/tag <player> add admin     admins can build anywhere
```

If another addon already has a `/menu` or `/is` command, use `/cb:menu`, `/cb:is`, `/cb:sc`.

## Rules in this version

- Max 5 players per clan; names are 3–16 letters, numbers or `_`, unique (ignoring case).
- Roles: see the Clans and roles table in the design doc. If the Owner leaves, the longest-serving
  Co-Owner (else Member) takes over; the last player leaving disbands the clan.
- A new clan gets a 15 × 15 starter island (tree + starter chest) inside a 100 × 100 border.
- In the island area you can only build on your own island, inside its border.
- The 9 × 9 stone-brick spawn zone can't be broken or built on; chests in it still open and
  spawners in it can still be picked up. Explosions don't damage it.

## Milestone 1 test checklist

- [ ] Create a clan; the island is built and you are teleported to it (and respawn there)
- [ ] Invite, accept, decline, kick, promote, demote, transfer and disband follow the roles table
- [ ] A 6th player can't join; a second clan can't reuse a name in different capitals
- [ ] You can't build outside your border or on someone else's island; admins can
- [ ] Spawn zone: can't break or place; chests open; spawners can be picked up; TNT doesn't damage it
- [ ] Kick a player while they're offline: when they rejoin they're clanless and respawn at world spawn
