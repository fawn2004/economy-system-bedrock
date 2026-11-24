import { system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG, ROLE, ROLE_NAME } from "./config.js";
import {
  acceptInvite,
  canManage,
  clanOf,
  createClan,
  declineInvite,
  demoteMember,
  disbandClan,
  invitePlayer,
  kickMember,
  leaveClan,
  memberCount,
  pendingInvite,
  promoteMember,
  roleOf,
  transferLeadership,
} from "./clans.js";
import { clearIslandSpawn, createIsland, sendHome } from "./islands.js";

// Milestone 1 uses plain Bedrock forms. Milestone 6 swaps in the chosen
// custom layouts (Elevator Tower, Chain of Command, ...) from the resource pack.

/** form.show() that waits while the player is busy (e.g. chat still open). */
async function show(player, form) {
  for (let tries = 0; tries < 40; tries++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (res.cancelationReason !== FormCancelationReason.UserBusy) return res;
    await system.waitTicks(5);
  }
  return undefined;
}

function report(player, result) {
  player.sendMessage(CONFIG.prefix + (result.ok ? "" : "§c") + result.msg);
}

async function confirm(player, title, body, yes = "Yes") {
  const res = await show(player, new MessageFormData().title(title).body(body).button1(yes).button2("Cancel"));
  return res?.selection === 0;
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

export async function mainMenu(player) {
  const clan = clanOf(player);
  return clan ? clanMenu(player, clan) : noClanMenu(player);
}

async function noClanMenu(player) {
  const inv = pendingInvite(player);
  const buttons = [];
  if (inv) buttons.push({ text: `§2Accept invite\n§r§8${inv.clan.name} · from ${inv.fromName}`, run: () => acceptAndGoHome(player) });
  buttons.push({ text: "Create a Clan\n§r§8Get your own island", run: () => createMenu(player) });
  if (inv) buttons.push({ text: "Decline invite", run: () => report(player, declineInvite(player)) });
  const form = new ActionFormData()
    .title(CONFIG.serverName)
    .body("§7You are not in a clan yet.\n\nCreate one to get an island, or ask a clan to invite you.");
  for (const b of buttons) form.button(b.text);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  await buttons[res.selection]?.run();
}

async function acceptAndGoHome(player) {
  const r = acceptInvite(player);
  report(player, r);
  if (r.ok) await sendHome(player, r.clan);
}

async function createMenu(player) {
  const c = CONFIG.clan;
  const res = await show(
    player,
    new ModalFormData()
      .title("Create a Clan")
      .textField(`Clan name (${c.nameMin}-${c.nameMax} letters, numbers or _)`, "e.g. Nightfall")
  );
  if (!res || res.canceled) return;
  const r = createClan(player, String(res.formValues?.[0] ?? ""));
  report(player, r);
  if (r.ok) await createIsland(player, r.clan);
}

async function clanMenu(player, clan) {
  const role = roleOf(clan, player.id);
  const manage = canManage(clan, player.id);
  const online = Object.keys(clan.members).filter((id) => world.getEntity(id)).length;
  const buttons = [
    { text: "Island Home\n§r§8Teleport to your island", run: () => sendHome(player, clan) },
    { text: `Members\n§r§8${online} / ${memberCount(clan)} online`, run: () => membersMenu(player) },
  ];
  if (manage) buttons.push({ text: "Invite a Player\n§r§8Online players with no clan", run: () => inviteMenu(player) });
  if (role === ROLE.owner) buttons.push({ text: "§4Disband Clan", run: () => disbandMenu(player) });
  else buttons.push({ text: "§4Leave Clan", run: () => leaveMenu(player) });

  const form = new ActionFormData()
    .title(`${CONFIG.serverName} · ${clan.name}`)
    .body(`§7Clan §b${clan.name}§7 · you are §f${ROLE_NAME[role]}§7 · ${memberCount(clan)}/${CONFIG.clan.maxMembers} players`);
  for (const b of buttons) form.button(b.text);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  await buttons[res.selection]?.run();
}

// ---------------------------------------------------------------------------
// Members (Chain of Command)
// ---------------------------------------------------------------------------

const ROLE_ORDER = { owner: 0, coowner: 1, member: 2 };

async function membersMenu(player) {
  const clan = clanOf(player);
  if (!clan) return;
  const list = Object.entries(clan.members).sort(
    (a, b) => ROLE_ORDER[a[1].role] - ROLE_ORDER[b[1].role] || a[1].joined - b[1].joined
  );
  const form = new ActionFormData().title(`Members · ${clan.name}`).body("§7Pick a player to see what you can do.");
  for (const [id, m] of list) {
    const on = world.getEntity(id) ? "§2online" : "§8offline";
    form.button(`${m.name}${id === player.id ? " §8(you)" : ""}\n§r§8${ROLE_NAME[m.role]} · ${on}`);
  }
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled) return;
  if (res.selection === list.length) return mainMenu(player);
  const [targetId, m] = list[res.selection];
  if (targetId === player.id) return membersMenu(player);
  return memberActions(player, targetId, m.name);
}

async function memberActions(player, targetId, targetName) {
  const clan = clanOf(player);
  if (!clan?.members[targetId]) return membersMenu(player);
  const mine = roleOf(clan, player.id);
  const theirs = roleOf(clan, targetId);
  const actions = [];
  if (canManage(clan, player.id) && theirs === ROLE.member) actions.push(["Promote to Co-Owner", () => promoteMember(player, targetId)]);
  if (mine === ROLE.owner && theirs === ROLE.coowner) actions.push(["Demote to Member", () => demoteMember(player, targetId)]);
  if (canManage(clan, player.id) && ROLE_ORDER[theirs] > ROLE_ORDER[mine])
    actions.push(["§4Kick", () => kickMember(player, targetId), `Kick ${targetName} from ${clan.name}?`]);
  if (mine === ROLE.owner)
    actions.push(["Transfer Leadership", () => transferLeadership(player, targetId), `Make ${targetName} the Owner? You become a Co-Owner.`]);

  const form = new ActionFormData()
    .title(targetName)
    .body(`§7${ROLE_NAME[theirs]} · joined ${new Date(clan.members[targetId].joined).toDateString()}`);
  for (const [label] of actions) form.button(label);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled) return;
  const pick = actions[res.selection];
  if (!pick) return membersMenu(player);
  if (pick[2] && !(await confirm(player, pick[0].replace(/§./g, ""), pick[2]))) return memberActions(player, targetId, targetName);
  const r = pick[1]();
  report(player, r);
  if (r.kickedId) {
    const kicked = world.getEntity(r.kickedId);
    if (kicked) clearIslandSpawn(kicked);
  }
  return membersMenu(player);
}

// ---------------------------------------------------------------------------
// Invite / leave / disband
// ---------------------------------------------------------------------------

async function inviteMenu(player) {
  const candidates = world.getPlayers().filter((p) => p.id !== player.id && !clanOf(p));
  if (candidates.length === 0) {
    player.sendMessage(`${CONFIG.prefix}Nobody online is without a clan right now.`);
    return;
  }
  const form = new ActionFormData().title("Invite a Player").body("§7Online players with no clan:");
  for (const p of candidates) form.button(p.name);
  const res = await show(player, form);
  if (!res || res.canceled) return;
  const target = candidates[res.selection];
  if (target?.isValid) report(player, invitePlayer(player, target));
}

async function leaveMenu(player) {
  const clan = clanOf(player);
  if (!clan) return;
  if (!(await confirm(player, "Leave Clan", `Leave §b${clan.name}§r? You lose access to its island.`, "Leave"))) return;
  const r = leaveClan(player);
  report(player, r);
  if (r.ok) clearIslandSpawn(player);
}

async function disbandMenu(player) {
  const clan = clanOf(player);
  if (!clan) return;
  if (!(await confirm(player, "Disband Clan", `Disband §b${clan.name}§r for everyone? The island is lost. This can't be undone.`, "Disband")))
    return;
  const members = Object.keys(clan.members);
  const r = disbandClan(player);
  report(player, r);
  if (r.ok) for (const id of members) {
    const p = world.getEntity(id);
    if (p) clearIslandSpawn(p);
  }
}
