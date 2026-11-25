#!/usr/bin/env bash
# Loads the REAL behaviour pack scripts (main.js and everything it imports) in a fake world
# and runs start-up + world load, like Minecraft does. Fails if anything throws.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r "$HERE"/../../packs/Cloudbreak_BP/scripts/* "$WORK"/
mkdir -p "$WORK/node_modules"
cp -r "$HERE"/mock/@minecraft "$WORK/node_modules/"
cat "$HERE/preview/server_extra.js" >> "$WORK/node_modules/@minecraft/server/index.js"
cat > "$WORK/startup.mjs" <<'JS'
import { world, system, handlers } from "@minecraft/server";
const evs = (obj, p) => new Proxy(obj ?? {}, { get: (t, k) => t[k] ?? { subscribe: (f) => ((handlers[p + String(k)] ??= []).push(f), f), unsubscribe() {} } });
world.afterEvents = evs(world.afterEvents, "a.");
world.beforeEvents = evs(world.beforeEvents, "b.");
system.afterEvents = evs(system.afterEvents, "sa.");
system.beforeEvents = evs(system.beforeEvents, "sb.");
world.scoreboard = { getObjective: () => null, addObjective: () => ({ getScore: () => 0, setScore() {}, getScores: () => [] }) };
world.getAllPlayers = () => [];
world.getDynamicPropertyIds = () => [];
Object.assign(system, { runInterval: () => 0, clearRun() {}, currentTick: 0 });
await import("./main.js");
const names = [];
for (const f of handlers["startup"] ?? []) f({ customCommandRegistry: { registerCommand: (d) => names.push(d.name), registerEnum() {} } });
for (const f of [...(handlers["load"] ?? []), ...(handlers["a.worldLoad"] ?? [])]) f();
if (names.length < 4) throw new Error("commands missing: " + names);
console.log(`start-up ok (${names.join(", ")})`);
JS
cd "$WORK" && node startup.mjs
