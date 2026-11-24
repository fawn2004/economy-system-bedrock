import { world } from "@minecraft/server";
import { CONFIG, ROLE, ROLE_NAME } from "./config.js";
import { deleteJson, loadJson, saveJson } from "./store.js";

// ---------------------------------------------------------------------------
// Data
//   world  "cb:clans"       -> ["c1", "c2", ...]  every clan id
//   world  "cb:clan:<id>"   -> clan record (below)
//   world  "cb:nextId"      -> next clan number
//   player "cb:clan"        -> the player's clan id (checked against the record)
//
// clan = {
//   id, name, created,
//   members: { [playerId]: { name, role, joined } },
//   island: { slot, x, y, z, size } | undefined
// }
// ---------------------------------------------------------------------------

const clans = new Map(); // id -> clan (cache of the saved records)
const invites = new Map(); // invitee playerId -> { clanId, fromName, expires }

export function loadClans() {
  clans.clear();
  for (const id of loadJson("cb:clans", [])) {
    const clan = loadJson(`cb:clan:${id}`, undefined);
    if (clan) clans.set(id, clan);
  }
}

export function saveClan(clan) {
  clans.set(clan.id, clan);
  saveJson(`cb:clan:${clan.id}`, clan);
  saveJson("cb:clans", [...clans.keys()]);
}

function removeClan(clan) {
  clans.delete(clan.id);
  deleteJson(`cb:clan:${clan.id}`);
  saveJson("cb:clans", [...clans.keys()]);
}

export const allClans = () => [...clans.values()];
export const getClan = (id) => clans.get(id);

export function clanByName(name) {
  const low = name.toLowerCase();
  return allClans().find((c) => c.name.toLowerCase() === low);
}

/** The player's clan, or undefined. Clears a stale id (kicked or disbanded while offline). */
export function clanOf(player) {
  const id = player.getDynamicProperty("cb:clan");
  if (id === undefined) return undefined;
  const clan = clans.get(id);
  if (!clan || !clan.members[player.id]) {
    try {
      player.setDynamicProperty("cb:clan", undefined);
    } catch {
      /* read-only (before-event): cleared next time */
    }
    return undefined;
  }
  return clan;
}

export const roleOf = (clan, playerId) => clan?.members[playerId]?.role;
export const memberCount = (clan) => Object.keys(clan.members).length;

export const canManage = (clan, playerId) => {
  const r = roleOf(clan, playerId);
  return r === ROLE.owner || r === ROLE.coowner;
};

export function onlineMembers(clan) {
  return world.getPlayers().filter((p) => clan.members[p.id]);
}

export function tellClan(clan, text) {
  for (const p of onlineMembers(clan)) p.sendMessage(CONFIG.prefix + text);
}

/** Keeps saved member names up to date when a player joins. */
export function refreshName(player) {
  const clan = clanOf(player);
  if (clan && clan.members[player.id].name !== player.name) {
    clan.members[player.id].name = player.name;
    saveClan(clan);
  }
}

// ---------------------------------------------------------------------------
// Actions. Each returns { ok, msg } so menus and commands share the rules.
// ---------------------------------------------------------------------------

const fail = (msg) => ({ ok: false, msg });
const done = (msg, extra) => ({ ok: true, msg, ...extra });

export function validName(name) {
  const c = CONFIG.clan;
  if (!name || name.length < c.nameMin || name.length > c.nameMax)
    return `Clan names are ${c.nameMin} to ${c.nameMax} characters.`;
  if (!c.namePattern.test(name)) return "Use only letters, numbers and _ in clan names.";
  if (clanByName(name)) return "That clan name is taken.";
  return undefined;
}

export function createClan(player, rawName) {
  const name = (rawName ?? "").trim();
  if (clanOf(player)) return fail("You are already in a clan. Leave it first.");
  const bad = validName(name);
  if (bad) return fail(bad);
  const next = world.getDynamicProperty("cb:nextId") ?? 1;
  world.setDynamicProperty("cb:nextId", next + 1);
  const clan = {
    id: `c${next}`,
    name,
    created: Date.now(),
    members: { [player.id]: { name: player.name, role: ROLE.owner, joined: Date.now() } },
    island: undefined,
  };
  saveClan(clan);
  player.setDynamicProperty("cb:clan", clan.id);
  invites.delete(player.id);
  return done(`Clan §b${name}§7 created!`, { clan });
}

export function invitePlayer(player, target) {
  const clan = clanOf(player);
  if (!clan) return fail("You are not in a clan.");
  if (!canManage(clan, player.id)) return fail("Only the Owner and Co-Owners can invite.");
  if (!target || target.id === player.id) return fail("Pick another player.");
  if (clanOf(target)) return fail(`${target.name} is already in a clan.`);
  if (memberCount(clan) >= CONFIG.clan.maxMembers) return fail(`Your clan is full (${CONFIG.clan.maxMembers} players).`);
  invites.set(target.id, { clanId: clan.id, fromName: player.name, expires: Date.now() + CONFIG.clan.inviteSeconds * 1000 });
  target.sendMessage(
    `${CONFIG.prefix}§e${player.name}§7 invited you to §b${clan.name}§7. Open the menu or type §f/sc accept§7 (expires in ${Math.round(CONFIG.clan.inviteSeconds / 60)} min).`
  );
  return done(`Invite sent to §e${target.name}§7.`);
}

export function pendingInvite(player) {
  const inv = invites.get(player.id);
  if (!inv) return undefined;
  if (inv.expires < Date.now() || !clans.has(inv.clanId)) {
    invites.delete(player.id);
    return undefined;
  }
  return { ...inv, clan: clans.get(inv.clanId) };
}

export function declineInvite(player) {
  invites.delete(player.id);
  return done("Invite declined.");
}

export function acceptInvite(player) {
  if (clanOf(player)) return fail("You are already in a clan.");
  const inv = pendingInvite(player);
  if (!inv) return fail("You have no invite (or it expired).");
  const clan = inv.clan;
  if (memberCount(clan) >= CONFIG.clan.maxMembers) {
    invites.delete(player.id);
    return fail(`${clan.name} is full.`);
  }
  clan.members[player.id] = { name: player.name, role: ROLE.member, joined: Date.now() };
  saveClan(clan);
  player.setDynamicProperty("cb:clan", clan.id);
  invites.delete(player.id);
  tellClan(clan, `§e${player.name}§7 joined the clan!`);
  return done(`You joined §b${clan.name}§7.`, { clan });
}

/** Picks the next Owner: longest-serving Co-Owner, else longest-serving Member. */
function successor(clan, excludeId) {
  const rest = Object.entries(clan.members).filter(([id]) => id !== excludeId);
  const pick = (role) => rest.filter(([, m]) => m.role === role).sort((a, b) => a[1].joined - b[1].joined)[0];
  return pick(ROLE.coowner) ?? pick(ROLE.member);
}

export function leaveClan(player) {
  const clan = clanOf(player);
  if (!clan) return fail("You are not in a clan.");
  const wasOwner = roleOf(clan, player.id) === ROLE.owner;
  delete clan.members[player.id];
  player.setDynamicProperty("cb:clan", undefined);
  if (memberCount(clan) === 0) {
    removeClan(clan);
    return done(`You left §b${clan.name}§7. It had no members left, so it was disbanded.`, { left: clan });
  }
  if (wasOwner) {
    const [id, m] = successor(clan, player.id);
    m.role = ROLE.owner;
    tellClan(clan, `§e${player.name}§7 left. §e${m.name}§7 is the new Owner.`);
  } else {
    tellClan(clan, `§e${player.name}§7 left the clan.`);
  }
  saveClan(clan);
  return done(`You left §b${clan.name}§7.`, { left: clan });
}

function targetCheck(player, targetId) {
  const clan = clanOf(player);
  if (!clan) return [undefined, fail("You are not in a clan.")];
  if (!clan.members[targetId]) return [undefined, fail("That player is not in your clan.")];
  if (targetId === player.id) return [undefined, fail("You can't do that to yourself.")];
  return [clan, undefined];
}

const rank = { owner: 3, coowner: 2, member: 1 };

export function kickMember(player, targetId) {
  const [clan, err] = targetCheck(player, targetId);
  if (err) return err;
  if (!canManage(clan, player.id)) return fail("Only the Owner and Co-Owners can kick.");
  if (rank[roleOf(clan, targetId)] >= rank[roleOf(clan, player.id)])
    return fail("You can only kick players below your role.");
  const name = clan.members[targetId].name;
  delete clan.members[targetId];
  saveClan(clan);
  const online = world.getPlayers().find((p) => p.id === targetId);
  if (online) {
    online.setDynamicProperty("cb:clan", undefined);
    online.sendMessage(`${CONFIG.prefix}You were kicked from §b${clan.name}§7.`);
  }
  tellClan(clan, `§e${name}§7 was kicked by §e${player.name}§7.`);
  return done(`Kicked §e${name}§7.`, { kickedId: targetId });
}

export function promoteMember(player, targetId) {
  const [clan, err] = targetCheck(player, targetId);
  if (err) return err;
  if (!canManage(clan, player.id)) return fail("Only the Owner and Co-Owners can promote.");
  const m = clan.members[targetId];
  if (m.role !== ROLE.member) return fail(`${m.name} is already a ${ROLE_NAME[m.role]}. Use Transfer Leadership to make a new Owner.`);
  m.role = ROLE.coowner;
  saveClan(clan);
  tellClan(clan, `§e${m.name}§7 was promoted to §bCo-Owner§7.`);
  return done(`Promoted §e${m.name}§7 to Co-Owner.`);
}

export function demoteMember(player, targetId) {
  const [clan, err] = targetCheck(player, targetId);
  if (err) return err;
  if (roleOf(clan, player.id) !== ROLE.owner) return fail("Only the Owner can demote a Co-Owner.");
  const m = clan.members[targetId];
  if (m.role !== ROLE.coowner) return fail(`${m.name} is not a Co-Owner.`);
  m.role = ROLE.member;
  saveClan(clan);
  tellClan(clan, `§e${m.name}§7 was demoted to Member.`);
  return done(`Demoted §e${m.name}§7 to Member.`);
}

export function transferLeadership(player, targetId) {
  const [clan, err] = targetCheck(player, targetId);
  if (err) return err;
  if (roleOf(clan, player.id) !== ROLE.owner) return fail("Only the Owner can transfer leadership.");
  clan.members[targetId].role = ROLE.owner;
  clan.members[player.id].role = ROLE.coowner;
  saveClan(clan);
  tellClan(clan, `§e${clan.members[targetId].name}§7 is the new Owner. §e${player.name}§7 is now a Co-Owner.`);
  return done("Leadership transferred.");
}

export function disbandClan(player) {
  const clan = clanOf(player);
  if (!clan) return fail("You are not in a clan.");
  if (roleOf(clan, player.id) !== ROLE.owner) return fail("Only the Owner can disband the clan.");
  tellClan(clan, `§b${clan.name}§7 was disbanded by §e${player.name}§7.`);
  for (const p of onlineMembers(clan)) p.setDynamicProperty("cb:clan", undefined);
  removeClan(clan);
  return done(`Disbanded §b${clan.name}§7.`, { disbanded: clan });
}
