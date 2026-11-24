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
