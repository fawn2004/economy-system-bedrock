import { system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { getBalance, initEconomy, rememberName, setBalance, syncBalances } from "./economy.js";
import { COMPASS_ID, giveCompass } from "./inventory.js";
import { mainMenu } from "./menus.js";
import { registerGroundItems } from "./groundItems.js";
import { applySavedSettings } from "./settings.js";
import { registerSpawners } from "./spawners.js";
import { registerTools } from "./tools.js";
import { registerSkills } from "./skills.js";
import { registerMinions } from "./minions.js";
import { registerLeaderboards } from "./leaderboards.js";
import { registerChunkHoppers } from "./chunkHopper.js";
import { registerNpcs } from "./npc.js";
import { registerPlayerSettings } from "./playerSettings.js";

world.afterEvents.worldLoad.subscribe(() => {
  applySavedSettings(); // in-game Admin > Settings changes
  initEconomy();
  system.runInterval(syncBalances, 100); // pick up /scoreboard money commands
  for (const p of world.getPlayers()) setupPlayer(p);
});

function setupPlayer(player) {
  if (!player.getDynamicProperty("eco:joined")) {
    player.setDynamicProperty("eco:joined", true);
    setBalance(player, getBalance(player) + CONFIG.startingBalance);
    player.sendMessage(`§b§lSkyblock Economy §r§7- you got §a${CONFIG.currency}${CONFIG.startingBalance} §7to start!`);
  } else {
    rememberName(player);
  }
  if (CONFIG.compass.giveOnJoin) giveCompass(player, CONFIG.compass.slot);
}

world.afterEvents.playerSpawn.subscribe(({ player }) => {
  // short delay so the inventory is ready
  system.runTimeout(() => {
    if (player.isValid) setupPlayer(player);
  }, 20);
});

// Right-click / tap with the compass opens the menu
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId !== COMPASS_ID) return;
  mainMenu(source).catch((e) => console.warn("[eco] menu error: " + e));
});

// /scriptevent eco:compass   -> gives the compass to whoever runs it
// /scriptevent eco:menu      -> opens the menu (handy for NPCs / command blocks with /execute as)
system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity }) => {
  if (sourceEntity?.typeId !== "minecraft:player") return;
  if (id === "eco:compass") giveCompass(sourceEntity, CONFIG.compass.slot);
  if (id === "eco:menu") mainMenu(sourceEntity).catch((e) => console.warn("[eco] menu error: " + e));
});

registerSpawners();
registerGroundItems();
registerTools();
registerSkills();
registerMinions();
registerLeaderboards();
registerChunkHoppers();
registerNpcs();
registerPlayerSettings();
