import { system, world } from "@minecraft/server";
import { skillHooks } from "./skills.js";
import { statSources } from "./stats.js";
import { ICON, backTile, fail, success, tileMenu } from "./ui.js";

// ============================================================================
//  MAYOR ELECTIONS
//  The server always has a mayor whose perks help everyone. While a mayor is
//  in office, players vote for the next one from 3 candidates. When the term
//  ends, the candidate with the most votes takes office (ties / no votes:
//  random) and 3 new candidates stand.
//  World data: eco:mayor = { mayor, termEnd, candidates, votes: { playerId: candidate } }
// ============================================================================

export const TERM_DAYS = 3; // real days per term
const DAY = 24 * 3600 * 1000;

export const CANDIDATES = {
  bramble: { name: "Bramble", icon: "textures/items/wheat", color: "§a", perks: ["+25% Farming XP", "+20 Farming Fortune"] },
  flint: { name: "Flint", icon: "textures/items/iron_pickaxe", color: "§7", perks: ["+25% Mining XP", "+20 Mining Fortune"] },
  vex: { name: "Vex", icon: "textures/items/eco_heads/zombie", color: "§c", perks: ["Slayer quests cost 25% less", "+25% Slayer XP"] },
  sable: { name: "Sable", icon: "textures/items/gold_ingot", color: "§6", perks: ["+1% Bank interest", "Bazaar tax halved"] },
  quill: { name: "Quill", icon: "textures/items/ender_eye", color: "§5", perks: ["+25% Dungeon Essence", "+25% Dungeon XP"] },
  marlow: { name: "Marlow", icon: "textures/items/fishing_rod_uncast", color: "§3", perks: ["+25% Fishing XP", "+5% Sea Creature Chance"] },
  ember: { name: "Ember", icon: "textures/items/blaze_powder", color: "§c", perks: ["+25% Combat XP", "+10 Strength for everyone"] },
  dawn: { name: "Dawn", icon: "textures/items/clock_item", color: "§e", perks: ["Daily Rewards doubled", "+10% XP in every skill"] },
};

function read() {
  try {
    const raw = world.getDynamicProperty("eco:mayor");
    if (typeof raw === "string") return JSON.parse(raw);
  } catch {}
  return undefined;
}
const save = (d) => world.setDynamicProperty("eco:mayor", JSON.stringify(d));
const pick = (n, exclude) => Object.keys(CANDIDATES).filter((c) => !exclude.includes(c)).sort(() => Math.random() - 0.5).slice(0, n);

function state() {
  let d = read();
  if (!d || !CANDIDATES[d.mayor]) {
    const mayor = pick(1, [])[0];
    d = { mayor, termEnd: Date.now() + TERM_DAYS * DAY, candidates: pick(3, [mayor]), votes: {} };
    save(d);
  }
  return d;
}

export const currentMayor = () => state().mayor;
export const mayorIs = (id) => currentMayor() === id;

function tally(d) {
  const counts = Object.fromEntries(d.candidates.map((c) => [c, 0]));
  for (const v of Object.values(d.votes)) if (v in counts) counts[v]++;
  return counts;
}

/** Ends the term if it's time (or `force`). */
export function checkElection(force = false) {
  const d = state();
  if (!force && Date.now() < d.termEnd) return;
  const counts = tally(d);
  const best = Math.max(...Object.values(counts));
  const top = d.candidates.filter((c) => counts[c] === best);
  const winner = top[Math.floor(Math.random() * top.length)];
  const next = { mayor: winner, termEnd: Date.now() + TERM_DAYS * DAY, candidates: pick(3, [winner]), votes: {} };
  save(next);
  const c = CANDIDATES[winner];
  world.sendMessage(`§6§lELECTION RESULTS! §r${c.color}§lMayor ${c.name} §r§7won with §f${best} §7votes!\n§7Perks: §a${c.perks.join("§7, §a")}`);
}

function timeLeft(ms) {
  const h = Math.max(0, Math.floor(ms / 3600000));
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

export async function mayorMenu(player, back) {
  const again = () => mayorMenu(player, back);
  checkElection();
  const d = state();
  const m = CANDIDATES[d.mayor];
  const counts = tally(d);
  const mine = d.votes[player.id];
  await tileMenu(player, {
    title: "ELECTION",
    theme: "gold",
    body: [
      `§7Current mayor: ${m.color}§l${m.name}`,
      `§7Perks: §a${m.perks.join("§7, §a")}`,
      `§7Next election in: §e${timeLeft(d.termEnd - Date.now())}`,
      mine ? `§7You voted for ${CANDIDATES[mine].color}${CANDIDATES[mine].name}§7 (tap another to change).` : "§7Tap a candidate to vote for the next mayor!",
    ].join("\n"),
    tiles: [
      ...d.candidates.map((id) => {
        const c = CANDIDATES[id];
        return {
          text: `${c.color}§l${c.name.toUpperCase()}${mine === id ? " ✔" : ""}`,
          sub: `§f${counts[id]} votes`,
          icon: c.icon,
          onClick: async () => {
            const ok = await tileMenu(player, {
              title: `VOTE ${c.name.toUpperCase()}`,
              theme: "gold",
              body: `${c.color}§l${c.name}§r §7promises:\n§a- ${c.perks.join("\n§a- ")}`,
              tiles: [
                { text: "§a§lVOTE", sub: "§7One vote each", icon: ICON.confirm, id: "yes" },
                backTile(),
              ],
            });
            if (ok?.id === "yes") {
              const cur = state();
              if (!cur.candidates.includes(id)) fail(player, "The election already ended.");
              else {
                cur.votes[player.id] = id;
                save(cur);
                success(player, `You voted for ${c.name}!`);
              }
            }
            return again();
          },
        };
      }),
      backTile(back),
    ],
  });
}

export function adminElection(player, back) {
  return tileMenu(player, {
    title: "ADMIN - ELECTION",
    theme: "gold",
    body: `§7Mayor: §f${CANDIDATES[currentMayor()].name}. End the election now, or pick the mayor yourself.`,
    tiles: [
      {
        text: "§6§lEND ELECTION",
        sub: "§7Count votes now",
        icon: ICON.confirm,
        onClick: () => {
          checkElection(true);
          return back();
        },
      },
      ...Object.entries(CANDIDATES).map(([id, c]) => ({
        text: `${c.color}§l${c.name.toUpperCase()}`,
        sub: "§7Make mayor",
        icon: c.icon,
        onClick: () => {
          const d = state();
          d.mayor = id;
          d.candidates = pick(3, [id]);
          d.votes = {};
          save(d);
          success(player, `${c.name} is now mayor.`);
          return back();
        },
      })),
      backTile(back),
    ],
  });
}

export function registerMayor() {
  const XP = { bramble: "farming", flint: "mining", marlow: "fishing", ember: "combat" };
  skillHooks.xpBonus.push((player, id) => {
    const m = currentMayor();
    return (XP[m] === id ? 25 : 0) + (m === "dawn" ? 10 : 0);
  });
  statSources.push(() => {
    const m = currentMayor();
    const stats = { bramble: { ffo: 20 }, flint: { mfo: 20 }, marlow: { scc: 5 }, ember: { str: 10 } }[m];
    return stats ? { label: `Mayor ${CANDIDATES[m].name}`, stats } : undefined;
  });
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(() => checkElection(), 1200));
}
