import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, ItemLockMode, ItemStack, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import {
  acceptInvite,
  clanOf,
  createClan,
  declineInvite,
  demoteMember,
  disbandClan,
  invitePlayer,
  kickMember,
  leaveClan,
  loadClans,
  promoteMember,
  refreshName,
  transferLeadership,
} from "./clans.js";
import { clearIslandSpawn, createIsland, registerProtection, sendHome, setOnHome } from "./islands.js";
import { coreTerminal, mainMenu, raidMenu, setFloor } from "./menus.js";
import { ensureCore, registerCore, setCoreTerminal, settleTax } from "./core.js";
import { backOut, raidOfPlayer, registerRaids } from "./raids.js";
import { payOwedKeys, registerAfterRaid } from "./after.js";
import { registerCrates } from "./crates.js";
import { registerSidebar } from "./sidebar.js";
import { adminPanel, applySavedRules } from "./admin.js";
import { registerEconomy, setupEconomyPlayer } from "./eco/index.js";
import { setHomeMenu } from "./eco/menus.js";

const MENU_ITEM = CONFIG.menuItem.id;

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

function giveMenuItem(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === MENU_ITEM) return;
  const item = new ItemStack(MENU_ITEM, 1);
  item.lockMode = ItemLockMode.inventory;
  item.keepOnDeath = true;
  if (!inv.getItem(CONFIG.menuItem.slot)) inv.setItem(CONFIG.menuItem.slot, item);
  else inv.addItem(item);
}

function setupPlayer(player) {
  setupEconomyPlayer(player);
  refreshName(player);
  // kicked or disbanded while offline: drop the old island spawn point
  if (!clanOf(player) && player.getDynamicProperty("cb:homeSet")) {
    clearIslandSpawn(player);
    player.setDynamicProperty("cb:homeSet", undefined);
  }
  if (CONFIG.menuItem.giveOnJoin) giveMenuItem(player);
  payOwedKeys(player);
  if (!player.getDynamicProperty("cb:joined")) {
    player.setDynamicProperty("cb:joined", true);
    player.sendMessage(`${CONFIG.prefix}Welcome to §b${CONFIG.serverName}§7! Use the menu item or type §f/menu§7 to create a clan.`);
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  applySavedRules();
  loadClans();
  for (const p of world.getPlayers()) setupPlayer(p);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => player.isValid && setupPlayer(player), 20);
});

const openMenu = (player) => mainMenu(player).catch((e) => console.warn(`[cloudbreak] menu error: ${e}`));

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId === MENU_ITEM) openMenu(source);
});

// /scriptevent cb:menu   -> opens the menu (NPCs, command blocks with /execute as)
// /scriptevent cb:item   -> gives the menu item back
system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity }) => {
  if (sourceEntity?.typeId !== "minecraft:player") return;
  if (id === "cb:menu") openMenu(sourceEntity);
  if (id === "cb:item") giveMenuItem(sourceEntity);
});

registerProtection();
registerEconomy();
setHomeMenu((player) => mainMenu(player));
registerCore();
setCoreTerminal(coreTerminal);
setOnHome((clan) => ensureCore(clan));
setFloor("afterDeposit", (clan) => settleTax(clan));
registerRaids();
registerAfterRaid();
registerCrates();
registerSidebar();
setFloor("admin", (player) => adminPanel(player));

// ---------------------------------------------------------------------------
// Commands: /menu, /is, /sc <action> [name]
// Command callbacks can't change the world, so the work runs on the next tick.
// ---------------------------------------------------------------------------

const say = (player, r) => player.sendMessage(CONFIG.prefix + (r.ok ? "" : "§c") + r.msg);

function memberIdByName(player, name) {
  const clan = clanOf(player);
  if (!clan || !name) return undefined;
  const low = name.toLowerCase();
  return Object.entries(clan.members).find(([, m]) => m.name.toLowerCase() === low)?.[0];
}

async function runClanCommand(player, action, arg) {
  switch (action) {
    case "create": {
      const r = createClan(player, arg);
      say(player, r);
      if (r.ok) await createIsland(player, r.clan);
      return;
    }
    case "invite": {
      const target = world.getPlayers({ name: arg })[0];
      if (!target) return say(player, { ok: false, msg: `No online player called ${arg ?? "?"}.` });
      return say(player, invitePlayer(player, target));
    }
    case "accept": {
      const r = acceptInvite(player);
      say(player, r);
      if (r.ok) await sendHome(player, r.clan);
      return;
    }
    case "decline":
      return say(player, declineInvite(player));
    case "leave": {
      const r = leaveClan(player);
      say(player, r);
      if (r.ok) clearIslandSpawn(player);
      return;
    }
    case "disband": {
      const clan = clanOf(player);
      const ids = clan ? Object.keys(clan.members) : [];
      const r = disbandClan(player);
      say(player, r);
      if (r.ok) for (const id of ids) {
        const p = world.getEntity(id);
        if (p) clearIslandSpawn(p);
      }
      return;
    }
    case "kick":
    case "promote":
    case "demote":
    case "transfer": {
      const id = memberIdByName(player, arg);
      if (!id) return say(player, { ok: false, msg: `No member called ${arg ?? "?"} in your clan.` });
      const fn = { kick: kickMember, promote: promoteMember, demote: demoteMember, transfer: transferLeadership }[action];
      const r = fn(player, id);
      say(player, r);
      if (r.kickedId) {
        const kicked = world.getEntity(r.kickedId);
        if (kicked) clearIslandSpawn(kicked);
      }
      return;
    }
    case "back":
      return say(player, backOut(player));
    case "raid":
      return raidMenu(player);
    default:
      return openMenu(player);
  }
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry: reg }) => {
  const player = (origin) => (origin.sourceEntity?.typeId === "minecraft:player" ? origin.sourceEntity : undefined);
  const ok = { status: CustomCommandStatus.Success };
  const notPlayer = { status: CustomCommandStatus.Failure, message: "Only players can use this command." };

  reg.registerCommand(
    { name: "cb:menu", description: "Open the Cloudbreak menu", permissionLevel: CommandPermissionLevel.Any },
    (origin) => {
      const p = player(origin);
      if (!p) return notPlayer;
      system.run(() => openMenu(p));
      return ok;
    }
  );

  reg.registerCommand(
    { name: "cb:is", description: "Teleport to your island", permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ name: "home", type: CustomCommandParamType.String }] },
    (origin) => {
      const p = player(origin);
      if (!p) return notPlayer;
      system.run(() => {
        if (raidOfPlayer(p)) return p.sendMessage(`${CONFIG.prefix}§cYou're in a raid. Finish it, or back out with §f/sc back§c.`);
        sendHome(p).catch((e) => console.warn(`[cloudbreak] home error: ${e}`));
      });
      return ok;
    }
  );

  reg.registerCommand(
    { name: "cb:admin", description: "Open the Cloudbreak admin panel", permissionLevel: CommandPermissionLevel.Any },
    (origin) => {
      const p = player(origin);
      if (!p) return notPlayer;
      system.run(() => adminPanel(p).catch((e) => console.warn(`[cloudbreak] admin error: ${e}`)));
      return ok;
    }
  );

  reg.registerEnum("cb:clanaction", ["create", "invite", "accept", "decline", "leave", "kick", "promote", "demote", "transfer", "disband", "menu", "back", "raid"]);
  reg.registerCommand(
    { name: "cb:sc", description: "Clan commands", permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "cb:clanaction", type: CustomCommandParamType.Enum }],
      optionalParameters: [{ name: "name", type: CustomCommandParamType.String }] },
    (origin, action, arg) => {
      const p = player(origin);
      if (!p) return notPlayer;
      system.run(() => runClanCommand(p, action, arg).catch((e) => console.warn(`[cloudbreak] command error: ${e}`)));
      return ok;
    }
  );
});
