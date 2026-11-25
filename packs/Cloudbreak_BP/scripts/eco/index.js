import { system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { getBalance, initEconomy, rememberName, setBalance, syncBalances } from "./economy.js";
import { registerGroundItems } from "./groundItems.js";
import { applySavedSettings } from "./settings.js";
import { registerSpawners } from "./spawners.js";
import { registerLeaderboards } from "./leaderboards.js";
import { registerChunkHoppers } from "./chunkHopper.js";
import { registerNpcs } from "./npc.js";
import { registerPlayerSettings } from "./playerSettings.js";

// The Skyblock Economy add-on, merged into Cloudbreak. Cloudbreak's own main.js
// calls registerEconomy() once at start-up and setupEconomyPlayer() on join.
// Left out on purpose (maybe a later update): skills, skill tools, collections,
// enchanted crops, the economy sidebar and the menu compass.

export function registerEconomy() {
  world.afterEvents.worldLoad.subscribe(() => {
    applySavedSettings(); // in-game Admin > Settings changes
    initEconomy();
    system.runInterval(syncBalances, 100); // pick up /scoreboard money commands
  });
  registerSpawners();
  registerGroundItems();
  registerLeaderboards();
  registerChunkHoppers();
  registerNpcs();
  registerPlayerSettings();
}

export function setupEconomyPlayer(player) {
  if (!player.getDynamicProperty("eco:joined")) {
    player.setDynamicProperty("eco:joined", true);
    setBalance(player, getBalance(player) + CONFIG.startingBalance);
    player.sendMessage(`§b§lCloudbreak §r§7- you got §a${CONFIG.currency}${CONFIG.startingBalance} §7to start!`);
  } else {
    rememberName(player);
  }
}
