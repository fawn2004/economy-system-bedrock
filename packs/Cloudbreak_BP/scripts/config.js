// Every Cloudbreak default lives here. Later milestones add the raid, core
// and shop numbers; admins will be able to change them in-game (Milestone 6).

export const CONFIG = {
  serverName: "Cloudbreak",
  version: "7.3", // shown in chat on join, so you can check the right behaviour pack is active
  prefix: "§b§lCloudbreak §r§8» §7",
  sidebarFooter: "", // bottom line of the sidebar, e.g. your server address ("" hides it)

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

  raid: {
    prices: { normal: 30000, intel: 45000, cheap: 15000, revenge: 20000 },
    backOutSeconds: 30, // raiders can back out this long after arriving
    backOutRefund: 0.5, // share of the price paid back when backing out (or walking away from intel)
    launchDistance: 60, // blocks from the target's border to the launch island
    bridgeSeconds: 600, // time to bridge across (Defence Time takes 30s off per level)
    lives: 3, // per raider (Extra Raid Life adds more)
    immunityHours: 12, // raid shield after being raided (Raid Shield Length adds 3h per level)
    lootSeconds: 900, // after a raider lands
    bankStolen: 0.25, // share of the target's clan bank taken on a win
    underdogBonus: 0.5, // extra (from the server) when a poorer clan wins against a richer one
    newClanDays: 3, // new clans can't be raided
    revengeHours: 24,
  },

  insurance: [
    { name: "Basic", pct: 0.1, price: 50000 },
    { name: "Silver", pct: 0.25, price: 250000 },
    { name: "Gold", pct: 0.5, price: 1000000 },
    { name: "Diamond", pct: 0.75, price: 5000000 },
  ],

  crates: {
    raider: { name: "Raider Crate", key: "cb:key_raider", color: "§c" },
    defender: { name: "Defender Crate", key: "cb:key_defender", color: "§b" },
    legendary: { name: "Legendary Crate", key: "cb:key_legendary", color: "§6" },
  },

  raidLogSize: 30,

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
  { id: "spawners", name: "Spawner Cap", max: 8, base: 50000, icon: "cage", desc: (l) => `Up to ${10 + 5 * l} spawners` },
  { id: "crops", name: "Crop Growth", max: 8, base: 50000, icon: "wheat", desc: (l) => `Crops grow x${(1 + 0.25 * l).toFixed(2)} faster` },
  { id: "shield", name: "Raid Shield Length", max: 4, base: 100000, icon: "shield", desc: (l) => `Immune ${CONFIG.raid.immunityHours + 3 * l}h after a raid` },
  { id: "defence", name: "Defence Time", max: 4, base: 100000, icon: "clock", desc: (l) => `Raiders get ${CONFIG.raid.bridgeSeconds - 30 * l}s to bridge to you` },
  { id: "lives", name: "Extra Raid Life", max: 2, base: 250000, icon: "heart", desc: (l) => `Your raiders get ${CONFIG.raid.lives + l} lives` },
];

