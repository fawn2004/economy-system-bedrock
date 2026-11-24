// Every Cloudbreak default lives here. Later milestones add the raid, core
// and shop numbers; admins will be able to change them in-game (Milestone 6).

export const CONFIG = {
  serverName: "Cloudbreak",
  prefix: "§b§lCloudbreak §r§8» §7",

  clan: {
    maxMembers: 5,
    nameMin: 3,
    nameMax: 16,
    namePattern: /^[A-Za-z0-9_]+$/,
    inviteSeconds: 300, // an invite expires after 5 minutes
  },

  island: {
    // Islands sit on a grid in the overworld, far from world spawn.
    // Use a void world so there is nothing between them.
    originX: 20000,
    originZ: 20000,
    spacing: 1000, // blocks between island centres
    columns: 50, // islands per grid row
    y: 100, // height of the island's grass layer
    startSize: 100, // border is startSize x startSize, centred on the island
    spawnProtection: 4, // 4 blocks each way = a 9 x 9 protected zone
  },

  core: {
    block: "cb:island_core",
    taxPerHour: 10000, // charged from the clan bank for every hour a member is online
    graceMinutes: 30, // after a failed payment, then the shield drops and upgrades switch off
    ledgerSize: 50,
  },

  menuItem: {
    id: "cb:menu",
    giveOnJoin: true,
    slot: 8,
  },
};

export const ROLE = {
  owner: "owner",
  coowner: "coowner",
  member: "member",
};

export const ROLE_NAME = {
  owner: "Owner",
  coowner: "Co-Owner",
  member: "Member",
};

// Island Core upgrades. cost(level) = base * 2^(level-1). Effects read the level.
export const UPGRADES = [
  { id: "size", name: "Island Size", max: 8, base: 50000, icon: "expand", desc: (l) => `Border ${100 + 25 * l} x ${100 + 25 * l}` },
  { id: "sell", name: "Sell Multiplier", max: 8, base: 50000, icon: "coin", desc: (l) => `Sell prices x${(1 + 0.25 * l).toFixed(2)}` },
  { id: "fly", name: "Island Fly", max: 1, base: 250000, icon: "feather", desc: (l) => (l ? "Fly anywhere on your island" : "Not unlocked") },
  { id: "ore", name: "Ore Generator", max: 8, base: 50000, icon: "bolt", desc: (l) => (l ? `${4 * l}% ore chance, up to ${ORE_NAMES[l - 1]}` : "Cobblestone only") },
  { id: "spawners", name: "Spawner Cap", max: 8, base: 50000, icon: "cage", desc: (l) => `Up to ${10 + 5 * l} spawners` },
  { id: "crops", name: "Crop Growth", max: 8, base: 50000, icon: "wheat", desc: (l) => `Crops grow x${(1 + 0.25 * l).toFixed(2)} faster` },
  { id: "shield", name: "Raid Shield Length", max: 4, base: 100000, icon: "shield", desc: (l) => `Immune ${12 + 3 * l}h after a raid` },
  { id: "defence", name: "Defence Time", max: 4, base: 100000, icon: "clock", desc: (l) => `Raiders get ${10 * 60 - 30 * l}s to bridge to you` },
  { id: "lives", name: "Extra Raid Life", max: 2, base: 250000, icon: "heart", desc: (l) => `Your raiders get ${3 + l} lives` },
];

// Ore Generator: ores unlocked per level (best last) and their weights.
export const ORES = [
  ["minecraft:coal_ore", 40],
  ["minecraft:iron_ore", 25],
  ["minecraft:copper_ore", 20],
  ["minecraft:gold_ore", 12],
  ["minecraft:redstone_ore", 10],
  ["minecraft:lapis_ore", 8],
  ["minecraft:diamond_ore", 4],
  ["minecraft:emerald_ore", 2],
];
export const ORE_NAMES = ["Coal", "Iron", "Copper", "Gold", "Redstone", "Lapis", "Diamond", "Emerald"];
