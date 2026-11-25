import { system, world } from "@minecraft/server";
import { paused } from "./titles.js";
export { pauseSidebar, showTitle } from "./titles.js";
import { CONFIG } from "./config.js";
import { clanOf, getClan, onlineMembers } from "./clans.js";
import { bankOf } from "./bank.js";
import { hoursCovered, shieldUp } from "./core.js";
import { raidAgainst, raidOfPlayer, raidStatus } from "./raids.js";
import { fmtMoney, getBalance } from "./eco/economy.js";
import { allHeadPoints } from "./eco/spawners.js";

// ---------------------------------------------------------------------------
// Core Monitor sidebar. Sent as a title with a hidden marker; the resource pack
// (ui/hud_screen.json) draws it as the panel on the right:
//   §e§s§b§r  normal (cyan outline)     §e§s§x§r  raid (red outline)
// Real titles pause it for a moment so they can be seen.
// ---------------------------------------------------------------------------

const NORMAL = "§e§s§b§r";
const RAID = "§e§s§x§r";
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function upkeepBar(clan) {
  const h = Math.min(hoursCovered(clan), 400);
  const filled = Math.round((h / 400) * 12);
  return `§a${"|".repeat(filled)}§8${"|".repeat(12 - filled)}`;
}

function normalLines(player, online) {
  const clan = clanOf(player);
  const heads = allHeadPoints(player).reduce((n, h) => n + h.points, 0);
  const st = clan?.stats ?? {};
  const out = [
    `§b§l${CONFIG.serverName.toUpperCase()}`,
    "§8SKY CLANS",
    "",
    `§7Player  §f${player.name}`,
    `§7Clan  §f${clan ? clan.name : "§8none"}`,
    `§7Balance  §e${fmtMoney(getBalance(player))}`,
  ];
  if (clan) {
    out.push(
      `§7Clan bank  §e${fmtMoney(bankOf(clan))}`,
      `§7Shield  ${shieldUp(clan) ? "§aONLINE" : "§cDOWN"}`,
      `§7Raids  §f${st.wins ?? 0}W §8· §f${st.losses ?? 0}L`
    );
  }
  out.push(`§7Heads  §f${commas(heads)}`, `§7Online  §f${online}`);
  if (clan) out.push("", `§8CORE UPKEEP  §a${hoursCovered(clan)}h`, upkeepBar(clan));
  if (CONFIG.sidebarFooter) out.push("", `§8${CONFIG.sidebarFooter}`);
  return out.join("\n");
}

function raiderLines(player, raid) {
  const s = raidStatus(raid);
  const r = raid.raiders[player.id];
  const looting = raid.phase === "loot";
  return [
    looting ? "§a§lLOOTING" : "§6§lRAID ACTIVE",
    "",
    `§7Target  §f${s.targetName}`,
    looting ? `§7Taken  §e${fmtMoney(s.stolen)}` : `§7To go  §f${s.distance} blocks`,
    `§7Time left  §e${s.timeLeft}`,
    `§7Your lives  §c${"■".repeat(Math.max(0, r?.lives ?? 0))}§8${"■".repeat(Math.max(0, raidLivesOf(raid) - (r?.lives ?? 0)))}`,
    `§7Squad  §f${s.raiders}`,
  ].join("\n");
}

function defenderLines(raid) {
  const s = raidStatus(raid);
  const looting = raid.phase === "loot";
  const target = getClan(raid.target);
  return [
    looting ? "§c§lBEING LOOTED" : "§c§lRAID INCOMING",
    "",
    `§7Raiders  §f${s.raiders} §8(${s.attackerName})`,
    looting ? `§7Taken  §c${fmtMoney(s.stolen)}` : `§7Distance  §c${s.distance} blocks`,
    looting ? "" : distanceBar(s.distance),
    `§7Time left  §e${s.timeLeft}`,
    `§7Defenders  §f${target ? onlineMembers(target).length : 0} / ${target ? Object.keys(target.members).length : 0}`,
    `§7Shield  ${target && shieldUp(target) ? "§aON" : "§cOFF"}`,
    looting ? "" : "§8Run §f/is §8to defend",
  ].join("\n");
}

// how far the raiders have got: 10 squares, red = bridged
function distanceBar(distance) {
  const total = Math.max(1, CONFIG.raid.launchDistance);
  const done = Math.max(0, Math.min(10, Math.round(((total - Number(distance || 0)) / total) * 10)));
  return `§c${"■".repeat(done)}§8${"■".repeat(10 - done)}`;
}

const raidLivesOf = (raid) => Math.max(...Object.values(raid.raiders).map((x) => x.maxLives ?? x.lives), 0);

let tickNo = 0;
function refresh() {
  tickNo++;
  const players = world.getAllPlayers();
  const now = system.currentTick;
  for (const p of players) {
    try {
      if ((paused.get(p.id) ?? 0) > now) continue;
      const mine = raidOfPlayer(p);
      const own = clanOf(p);
      const against = own && raidAgainst(own.id);
      let text;
      if (mine) text = RAID + raiderLines(p, mine);
      else if (against) text = RAID + defenderLines(against);
      else if (tickNo % 4 === 0) text = NORMAL + normalLines(p, players.length);
      else continue;
      p.onScreenDisplay.setTitle(text, { fadeInDuration: 0, stayDuration: 200, fadeOutDuration: 0 });
    } catch {}
  }
}

export function registerSidebar() {
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(refresh, 10));
  world.afterEvents.playerLeave.subscribe(({ playerId }) => paused.delete(playerId));
}
