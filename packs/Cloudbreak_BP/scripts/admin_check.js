// Who counts as an admin, in one place:
//   * a player with the "admin" tag (any capitals: admin, Admin, ADMIN), or
//   * a world operator (the world owner, or anyone given operator in the player list).
export function isAdmin(player) {
  try {
    if (player.getTags().some((t) => t.toLowerCase() === "admin")) return true;
  } catch {}
  try {
    if (player.playerPermissionLevel === 2) return true; // PlayerPermissionLevel.Operator
  } catch {}
  try {
    if (player.commandPermissionLevel >= 1) return true; // GameDirectors and above (ops, cheats)
  } catch {}
  return false;
}
