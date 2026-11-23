import { system, world } from "@minecraft/server";

// ============================================================================
//  SKYBLOCK ECONOMY - CHAT RANKS
//  A tiny separate pack (it needs the Beta APIs experiment, the main pack
//  doesn't). The main pack puts the player's active rank prefix in a tag
//  "eco_chat:<prefix>"; this pack rewrites chat messages as
//      [RANK] Name: message
//  If this pack breaks after a Minecraft update, the main pack keeps working -
//  chat just goes back to normal until an updated chat pack is installed.
// ============================================================================

const prefixOf = (p) => {
  try {
    const t = p.getTags().find((x) => x.startsWith("eco_chat:"));
    return t ? t.slice(9) + " " : "";
  } catch {
    return "";
  }
};

world.beforeEvents.chatSend.subscribe((ev) => {
  const { sender, message } = ev;
  if (!sender || message.startsWith("/")) return;
  const prefix = prefixOf(sender);
  const muted = sender.hasTag("eco_muted");
  const targets = ev.targets;
  ev.cancel = true;
  system.run(() => {
    if (muted) {
      sender.sendMessage("§cYou are muted.");
      return;
    }
    const line = `${prefix}§f${sender.name}§7: §f${message}`;
    if (targets?.length) for (const t of targets) t.sendMessage(line);
    else world.sendMessage(line);
  });
});
