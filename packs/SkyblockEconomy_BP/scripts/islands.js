import { ItemStack, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { fmt, getBalance, takeMoney } from "./economy.js";
import { pauseSidebar } from "./sidebar.js";
import { ICON, backTile, fail, showForm, success, tileMenu } from "./ui.js";

// ============================================================================
//  SKY ISLANDS
//  Tap the Island NPC (or Menu > Island) to get your own island out in the
//  void. Every player can own ONE island. Islands sit on a grid far from spawn
//  (ISLAND.spacing = 1000 blocks between island centres), so two islands are
//  always 1000 blocks apart.
//
//  Size = the width of the square you can build in, centred on the island:
//    Level 1: 100 x 100   Level 2: 200 x 200   Level 3: 300 x 300
//  Walking past the edge pushes you back; falling into the void teleports you
//  back to the island's home. Only the owner + their members can build/open
//  chests there (admins can always).
//  The Home NPC (or Menu > Island > Home) takes you back to your island.
//
//  Data:  world  eco:isl:<n>  = { o owner id, n owner name, s size 0-2,
//                                h home [x,y,z], m [member ids], v visitors?, t created }
//         world  eco:islNext  = next free grid slot
//         player eco:island   = their grid slot
//         world  eco:hub      = [x,y,z] where "Hub" teleports to (Admin > Islands)
// ============================================================================

export const ISLAND = {
  origin: { x: 10000, z: 10000 }, // grid starts here (far from spawn)
  y: 100, // height of the grass on a new island
  spacing: 1000, // blocks between island centres
  perRow: 50, // islands per grid row
  sizes: [100, 200, 300], // build area width per level
  costs: [0, 500000, 2500000], // price to reach each level
};

const KEY = (n) => `eco:isl:${n}`;
const cache = new Map(); // slot -> data
const MAX_LEVEL = ISLAND.sizes.length - 1;

function load(n) {
  if (cache.has(n)) return cache.get(n);
  let d;
  try {
    const raw = world.getDynamicProperty(KEY(n));
    d = typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {}
  cache.set(n, d);
  return d;
}
function save(n, d) {
  cache.set(n, d);
  world.setDynamicProperty(KEY(n), d ? JSON.stringify(d) : undefined);
}

export const centerOf = (n) => ({ x: ISLAND.origin.x + (n % ISLAND.perRow) * ISLAND.spacing, z: ISLAND.origin.z + Math.floor(n / ISLAND.perRow) * ISLAND.spacing });
export const islandWidth = (d) => ISLAND.sizes[Math.min(MAX_LEVEL, d?.s ?? 0)];

/** Grid slot a position belongs to, or undefined when it's outside the island grid. */
export function slotAt(loc) {
  const col = Math.round((loc.x - ISLAND.origin.x) / ISLAND.spacing);
  const row = Math.round((loc.z - ISLAND.origin.z) / ISLAND.spacing);
  if (col < 0 || col >= ISLAND.perRow || row < 0) return undefined;
  return row * ISLAND.perRow + col;
}

export function islandOf(player) {
  const n = player.getDynamicProperty("eco:island");
  if (typeof n !== "number") return undefined;
  const d = load(n);
  if (!d || d.o !== player.id) return undefined; // deleted by an admin
  return { n, d };
}
/** The island this player can call home: their own, else one they're a member of. */
function homeIsland(player) {
  const own = islandOf(player);
  if (own) return own;
  const m = player.getDynamicProperty("eco:islandMember");
  if (typeof m === "number" && load(m)?.m?.includes(player.id)) return { n: m, d: load(m) };
  return undefined;
}

const canBuild = (player, d) => !!d && (d.o === player.id || d.m?.includes(player.id));

/** For the sidebar: name of the island at the player's position. */
export function islandLabel(player) {
  if (player.dimension.id !== "minecraft:overworld") return undefined;
  const n = slotAt(player.location);
  if (n === undefined) return undefined;
  const d = load(n);
  if (!d) return "§7The Void";
  return d.o === player.id ? "§bYour Island" : `§b${d.n}'s Island`;
}

// ---- building a new island -----------------------------------------------------
const STARTER_CHEST = [
  ["minecraft:water_bucket", 2],
  ["minecraft:lava_bucket", 1],
  ["minecraft:ice", 2],
  ["minecraft:oak_sapling", 4],
  ["minecraft:bone_meal", 16],
  ["minecraft:sugar_cane", 2],
  ["minecraft:cactus", 1],
  ["minecraft:wheat_seeds", 8],
  ["minecraft:melon_seeds", 2],
  ["minecraft:pumpkin_seeds", 2],
  ["minecraft:red_mushroom", 1],
  ["minecraft:brown_mushroom", 1],
  ["minecraft:bread", 16],
  ["minecraft:torch", 16],
  ["minecraft:dirt", 32],
  ["minecraft:sand", 8],
];

function buildIsland(dim, c) {
  const Y = ISLAND.y;
  const set = (x, y, z, type) => {
    try {
      dim.setBlockType({ x: c.x + x, y, z: c.z + z }, type);
    } catch {}
  };
  // layers: [y offset, radius^2, block]
  const layers = [
    [0, 20, "minecraft:grass_block"],
    [-1, 16, "minecraft:dirt"],
    [-2, 11, "minecraft:dirt"],
    [-3, 6, "minecraft:stone"],
    [-4, 2, "minecraft:stone"],
  ];
  for (const [dy, r2, block] of layers) {
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) if (x * x + z * z <= r2) set(x, Y + dy, z, block);
  }
  set(0, Y - 3, 0, "minecraft:bedrock");
  // a little sand beach + a clay corner
  for (const [x, z] of [[-4, 1], [-4, 2], [-3, 3]]) set(x, Y, z, "minecraft:sand");
  // tree
  const tx = 2, tz = 2;
  for (let y = 1; y <= 5; y++) set(tx, Y + y, tz, "minecraft:oak_log");
  for (let y = 3; y <= 6; y++) {
    const r = y >= 6 ? 1 : 2;
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++) {
        if ((x === 0 && z === 0 && y <= 5) || (Math.abs(x) === r && Math.abs(z) === r && r === 2)) continue;
        set(tx + x, Y + y, tz + z, "minecraft:oak_leaves");
      }
  }
  // starter chest
  set(-2, Y + 1, -2, "minecraft:chest");
  try {
    const inv = dim.getBlock({ x: c.x - 2, y: Y + 1, z: c.z - 2 })?.getComponent("minecraft:inventory")?.container;
    STARTER_CHEST.forEach(([id, n], i) => inv?.setItem(i, new ItemStack(id, n)));
  } catch {}
}

const busy = new Set(); // players whose island is being made

export async function createIsland(player) {
  if (islandOf(player)) return fail(player, "You already have an island! Use Home to go there.");
  if (busy.has(player.id)) return;
  busy.add(player.id);
  const n = Number(world.getDynamicProperty("eco:islNext") ?? 0);
  world.setDynamicProperty("eco:islNext", n + 1);
  const c = centerOf(n);
  const home = [c.x + 0.5, ISLAND.y + 1, c.z + 0.5];
  save(n, { o: player.id, n: player.name, s: 0, h: home, m: [], v: true, t: Date.now() });
  player.setDynamicProperty("eco:island", n);
  const dim = world.getDimension("minecraft:overworld");
  const hold = { x: home[0], y: ISLAND.y + 4, z: home[2] };
  pauseSidebar(player, 120);
  try {
    player.onScreenDisplay.setTitle("§b§lNEW ISLAND", { subtitle: "§7Generating your island...", fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 10 });
  } catch {}
  // go there, wait until the chunk is loaded, then build
  let tries = 0;
  const step = () => {
    if (!player.isValid) return busy.delete(player.id);
    try {
      player.teleport(hold, { dimension: dim });
      player.addEffect("slow_falling", 60, { showParticles: false });
    } catch {}
    let loaded = false;
    try {
      loaded = !!dim.getBlock(hold);
    } catch {}
    if (!loaded && tries++ < 40) return system.runTimeout(step, 5);
    buildIsland(dim, c);
    system.runTimeout(() => {
      busy.delete(player.id);
      if (!player.isValid) return;
      try {
        player.teleport({ x: home[0], y: home[1], z: home[2] }, { dimension: dim });
      } catch {}
      player.playSound("random.levelup");
      success(player, `Welcome to your island! You can build in a ${ISLAND.sizes[0]}x${ISLAND.sizes[0]} area - upgrade it in Menu > Island.`);
      player.sendMessage("§7Your starter chest is next to you. Tap the §fHome§7 NPC or use §fMenu > Island > Home§7 to come back.");
    }, 10);
  };
  step();
}

export function goHome(player) {
  const h = homeIsland(player);
  if (!h) return fail(player, "You don't have an island yet - tap the Island NPC to make one!");
  const [x, y, z] = h.d.h;
  try {
    player.teleport({ x, y, z }, { dimension: world.getDimension("minecraft:overworld") });
  } catch {}
  player.playSound("mob.endermen.portal");
  player.sendMessage("§aWelcome home!");
}

function goHub(player) {
  const raw = world.getDynamicProperty("eco:hub");
  let at;
  try {
    at = raw ? JSON.parse(String(raw)) : undefined;
  } catch {}
  const spawn = at ? { x: at[0], y: at[1], z: at[2] } : world.getDefaultSpawnLocation();
  if (!at && spawn.y > 320) spawn.y = 100; // spawn has no fixed height in some worlds
  try {
    player.teleport(spawn, { dimension: world.getDimension("minecraft:overworld") });
  } catch {}
  player.sendMessage("§aTeleported to the hub.");
}

// ---- edge + void + build protection --------------------------------------------
const showBorder = new Map(); // player id -> tick until which the border is drawn

function watch() {
  const tick = system.currentTick;
  for (const p of world.getAllPlayers()) {
    try {
      if (p.dimension.id !== "minecraft:overworld") continue;
      const n = slotAt(p.location);
      if (n === undefined) continue;
      const d = load(n);
      const c = centerOf(n);
      const admin = p.hasTag(CONFIG.adminTag);
      if (p.location.y < -40) {
        // fell into the void: back to this island's home (or your own)
        if (d) p.teleport({ x: d.h[0], y: d.h[1], z: d.h[2] });
        else if (homeIsland(p)) goHome(p);
        else goHub(p);
        p.sendMessage("§7You fell into the void - teleported back.");
        continue;
      }
      if (!d) {
        if (!admin) {
          if (homeIsland(p)) goHome(p);
          else goHub(p);
        }
        continue;
      }
      const half = islandWidth(d) / 2;
      const dx = p.location.x - c.x, dz = p.location.z - c.z;
      if (!admin && (Math.abs(dx) > half || Math.abs(dz) > half)) {
        const clamp = (v) => Math.max(-half + 1, Math.min(half - 1, v));
        p.teleport({ x: c.x + clamp(dx), y: p.location.y, z: c.z + clamp(dz) });
        p.onScreenDisplay.setActionBar(`§cThat's the edge of the island! §7(${islandWidth(d)}x${islandWidth(d)})`);
        continue;
      }
      if (Math.abs(dx) > half - 4 || Math.abs(dz) > half - 4) showBorder.set(p.id, Math.max(showBorder.get(p.id) ?? 0, tick + 20));
      if ((showBorder.get(p.id) ?? 0) > tick) drawBorder(p, c, half);
    } catch {}
  }
}

function drawBorder(p, c, half) {
  const y = Math.floor(p.location.y) + 1;
  const near = 12;
  const edges = [
    [c.x - half, null],
    [c.x + half, null],
    [null, c.z - half],
    [null, c.z + half],
  ];
  for (const [ex, ez] of edges) {
    if (ex !== null && Math.abs(p.location.x - ex) > near) continue;
    if (ez !== null && Math.abs(p.location.z - ez) > near) continue;
    for (let i = -near; i <= near; i += 2) {
      const x = ex ?? Math.floor(p.location.x) + i;
      const z = ez ?? Math.floor(p.location.z) + i;
      if (Math.abs(x - c.x) > half || Math.abs(z - c.z) > half) continue;
      for (const dy of [-1, 1])
        try {
          p.dimension.spawnParticle("minecraft:villager_happy", { x, y: y + dy, z });
        } catch {}
    }
  }
}

function blocked(player, loc) {
  if (player.dimension.id !== "minecraft:overworld" || player.hasTag(CONFIG.adminTag)) return false;
  const n = slotAt(loc);
  if (n === undefined) return false;
  const d = load(n);
  if (canBuild(player, d)) {
    const c = centerOf(n), half = islandWidth(d) / 2;
    return Math.abs(loc.x + 0.5 - c.x) > half || Math.abs(loc.z + 0.5 - c.z) > half; // outside the border
  }
  return true;
}
const warned = new Map();
function warn(player, msg) {
  if ((warned.get(player.id) ?? -99) > system.currentTick - 20) return;
  warned.set(player.id, system.currentTick);
  system.run(() => player.isValid && player.onScreenDisplay.setActionBar(msg));
}

// ---- menus -------------------------------------------------------------------
export async function islandMenu(player, back) {
  const again = () => islandMenu(player, back);
  const own = islandOf(player);
  const home = homeIsland(player);
  if (!home) {
    return tileMenu(player, {
      title: "Sky Island",
      theme: "blue",
      body: [
        "§7You don't have an island yet!",
        "",
        `§7Get your own floating island out in the void. It starts at §f${ISLAND.sizes[0]}x${ISLAND.sizes[0]}§7 and can be upgraded to §f${ISLAND.sizes[MAX_LEVEL]}x${ISLAND.sizes[MAX_LEVEL]}§7.`,
        "§7You get a starter chest with everything you need.",
        "§8One island per player.",
      ].join("\n"),
      tiles: [
        { text: "§a§lCREATE ISLAND", sub: "§7Free!", icon: "textures/blocks/grass_side_carried", onClick: () => createIsland(player) },
        { text: "§b§lVISIT", sub: "§7Other islands", icon: "textures/items/ender_pearl", onClick: () => visitMenu(player, again) },
        backTile(back),
      ],
    });
  }
  const d = home.d;
  const lvl = d.s;
  const tiles = [
    { text: "§a§lHOME", sub: "§7Teleport home", icon: "textures/items/bed_red", onClick: () => goHome(player) },
    {
      text: "§e§lSET HOME",
      sub: "§7Stand where you\n§7want to arrive",
      icon: "textures/items/compass_item",
      onClick: () => {
        if (slotAt(player.location) !== home.n || !canBuild(player, d)) return fail(player, "Stand on your island to set its home.");
        d.h = [Math.floor(player.location.x) + 0.5, Math.floor(player.location.y), Math.floor(player.location.z) + 0.5];
        save(home.n, d);
        success(player, "Island home set here.");
        return again();
      },
    },
  ];
  if (own) {
    tiles.push({
      text: "§6§lUPGRADE SIZE",
      sub: lvl >= MAX_LEVEL ? "§aMax size!" : `§7${islandWidth(d)} -> ${ISLAND.sizes[lvl + 1]}\n§a${fmt(ISLAND.costs[lvl + 1])}`,
      icon: "textures/items/diamond",
      onClick: () => upgradeMenu(player, again),
    });
    tiles.push({ text: "§b§lMEMBERS", sub: `§7${d.m.length} member${d.m.length === 1 ? "" : "s"}`, icon: ICON.player, onClick: () => membersMenu(player, again) });
    tiles.push({
      text: d.v ? "§a§lVISITORS: ON" : "§c§lVISITORS: OFF",
      sub: d.v ? "§7Anyone can visit\n§7(they can't build)" : "§7Only members",
      icon: d.v ? "textures/items/door_wood" : "textures/items/door_iron",
      onClick: () => {
        d.v = !d.v;
        save(home.n, d);
        return again();
      },
    });
  }
  tiles.push(
    { text: "§b§lVISIT", sub: "§7Other islands", icon: "textures/items/ender_pearl", onClick: () => visitMenu(player, again) },
    { text: "§d§lSHOW BORDER", sub: "§7For 10 seconds", icon: "textures/items/glowstone_dust", onClick: () => (showBorder.set(player.id, system.currentTick + 200), success(player, "Showing the island border.")) },
    { text: "§e§lHUB", sub: "§7Go to spawn", icon: "textures/items/nether_star", onClick: () => goHub(player) },
    backTile(back)
  );
  await tileMenu(player, {
    title: own ? "Your Island" : `${d.n}'s Island`,
    theme: "blue",
    body: [
      `§7Owner: §f${d.n}`,
      `§7Size: §f${islandWidth(d)}x${islandWidth(d)} §8(level ${lvl + 1}/${MAX_LEVEL + 1})`,
      `§7Members: §f${d.m.length}`,
      `§7Visitors: ${d.v ? "§aallowed" : "§cmembers only"}`,
      own ? "" : "§8You're a member of this island.",
    ].join("\n"),
    tiles,
  });
}

async function upgradeMenu(player, back) {
  const own = islandOf(player);
  if (!own) return back();
  const { n, d } = own;
  if (d.s >= MAX_LEVEL) {
    success(player, "Your island is already the biggest size!");
    return back();
  }
  const cost = ISLAND.costs[d.s + 1];
  const r = await tileMenu(player, {
    title: "Upgrade Island",
    theme: "blue",
    body: `§7Make your island bigger:\n§f${islandWidth(d)}x${islandWidth(d)} §7-> §a${ISLAND.sizes[d.s + 1]}x${ISLAND.sizes[d.s + 1]}\n\n§7Cost: ${getBalance(player) >= cost ? "§a" : "§c"}${fmt(cost)}`,
    tiles: [{ text: "§a§lUPGRADE", sub: `§a${fmt(cost)}`, icon: ICON.confirm, id: "yes" }, backTile()],
  });
  if (r?.id === "yes") {
    if (!takeMoney(player, cost)) fail(player, `You need ${fmt(cost)}.`);
    else {
      d.s++;
      save(n, d);
      player.playSound("random.levelup");
      success(player, `Your island is now ${islandWidth(d)}x${islandWidth(d)}!`);
      showBorder.set(player.id, system.currentTick + 200);
    }
  }
  return back();
}

async function membersMenu(player, back) {
  const own = islandOf(player);
  if (!own) return back();
  const { n, d } = own;
  const again = () => membersMenu(player, back);
  const nameOf = (id) => world.getAllPlayers().find((p) => p.id === id)?.name ?? d.mn?.[id] ?? "Player";
  const tiles = d.m.map((id) => ({
    text: `§f${nameOf(id)}`,
    sub: "§cTap to remove",
    icon: ICON.player,
    onClick: () => {
      d.m = d.m.filter((x) => x !== id);
      save(n, d);
      success(player, `${nameOf(id)} is no longer a member.`);
      return again();
    },
  }));
  const others = world.getAllPlayers().filter((p) => p.id !== player.id && !d.m.includes(p.id));
  tiles.push({
    text: "§a§lADD MEMBER",
    sub: others.length ? "§7Online players" : "§8Nobody online",
    icon: ICON.confirm,
    onClick: async () => {
      if (!others.length) return again();
      const res = await showForm(player, new ModalFormData().title("Add a member").dropdown("Player", others.map((p) => p.name), { defaultValueIndex: 0 }));
      const who = res && !res.canceled ? others[Number(res.formValues[0]) || 0] : undefined;
      if (who?.isValid) {
        if (d.m.length >= 8) fail(player, "Islands can have up to 8 members.");
        else {
          d.m.push(who.id);
          (d.mn ??= {})[who.id] = who.name;
          save(n, d);
          if (!islandOf(who)) who.setDynamicProperty("eco:islandMember", n);
          success(player, `${who.name} can now build on your island.`);
          who.sendMessage(`§a${player.name} added you to their island! §7Menu > Island to visit it.`);
        }
      }
      return again();
    },
  });
  tiles.push(backTile(back));
  await tileMenu(player, { title: "Island Members", theme: "blue", body: "§7Members can build, break and open chests on your island. Tap one to remove them.", tiles });
}

async function visitMenu(player, back) {
  const list = [];
  for (const p of world.getAllPlayers()) {
    const own = islandOf(p);
    if (!own || p.id === player.id) continue;
    if (!own.d.v && !own.d.m.includes(player.id) && !player.hasTag(CONFIG.adminTag)) continue;
    list.push({ p, own });
  }
  await tileMenu(player, {
    title: "Visit an Island",
    theme: "blue",
    body: list.length ? "§7Islands of players online right now." : "§7Nobody online has an island open to visitors.",
    tiles: [
      ...list.map(({ p, own }) => ({
        text: `§b${p.name}`,
        sub: `§7${islandWidth(own.d)}x${islandWidth(own.d)}`,
        icon: "textures/blocks/grass_side_carried",
        onClick: () => {
          const [x, y, z] = own.d.h;
          player.teleport({ x, y, z }, { dimension: world.getDimension("minecraft:overworld") });
          player.sendMessage(`§aWelcome to ${p.name}'s island!`);
          p.sendMessage(`§7${player.name} is visiting your island.`);
        },
      })),
      backTile(back),
    ],
  });
}

/** Admin > Islands */
export async function adminIslands(player, back) {
  const again = () => adminIslands(player, back);
  await tileMenu(player, {
    title: "Admin: Islands",
    theme: "red",
    body: `§7Islands made: §f${Number(world.getDynamicProperty("eco:islNext") ?? 0)}\n§7Grid starts at §f${ISLAND.origin.x}, ${ISLAND.origin.z}§7, ${ISLAND.spacing} blocks apart.`,
    tiles: [
      {
        text: "§e§lSET HUB HERE",
        sub: "§7Where Hub sends\n§7players",
        icon: "textures/items/nether_star",
        onClick: () => {
          const l = player.location;
          world.setDynamicProperty("eco:hub", JSON.stringify([Math.floor(l.x) + 0.5, Math.floor(l.y), Math.floor(l.z) + 0.5]));
          success(player, "Hub set to where you're standing.");
          return again();
        },
      },
      {
        text: "§c§lDELETE ISLAND",
        sub: "§7Let a player make\n§7a new one",
        icon: ICON.cancel,
        onClick: async () => {
          const ps = world.getAllPlayers().filter((p) => islandOf(p));
          if (!ps.length) {
            fail(player, "Nobody online has an island.");
            return again();
          }
          const res = await showForm(player, new ModalFormData().title("Delete an island").dropdown("Player (online)", ps.map((p) => p.name), { defaultValueIndex: 0 }).toggle("Yes, delete it (blocks stay in the void)", { defaultValue: false }));
          if (res && !res.canceled && res.formValues[1]) {
            const t = ps[Number(res.formValues[0]) || 0];
            const own = islandOf(t);
            if (own) {
              save(own.n, undefined);
              t.setDynamicProperty("eco:island", undefined);
              success(player, `Deleted ${t.name}'s island. They can make a new one.`);
            }
          }
          return again();
        },
      },
      {
        text: "§b§lTP TO ISLAND",
        sub: "§7Of an online player",
        icon: "textures/items/ender_pearl",
        onClick: () => visitMenu(player, again),
      },
      backTile(back),
    ],
  });
}

export function registerIslands() {
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(watch, 10));
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (blocked(ev.player, ev.block.location)) {
      ev.cancel = true;
      warn(ev.player, "§cYou can't build here.");
    }
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (blocked(ev.player, ev.block.location)) {
      ev.cancel = true;
      warn(ev.player, "§cThis isn't your island.");
    }
  });
  // visitors can't hurt animals on other islands
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.target?.typeId === "eco:npc" || ev.target?.typeId === "eco:crate") return;
    if (ev.target && blocked(ev.player, ev.target.location)) ev.cancel = true;
  });
}
