// Who counts as an admin: ONLY players with the "admin" tag (any capitals: admin, Admin, ADMIN).
// Being a world operator does NOT make you an admin.   Give it with: /tag <name> add admin
export function isAdmin(player) {
  try {
    return player.getTags().some((t) => t.toLowerCase() === "admin");
  } catch {
    return false;
  }
}
