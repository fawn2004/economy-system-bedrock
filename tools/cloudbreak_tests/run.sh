#!/usr/bin/env bash
# Offline rule tests for Cloudbreak (no Minecraft needed): a fake @minecraft/server
# and small stand-ins for the economy modules. Usage: tools/cloudbreak_tests/run.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp "$HERE"/../../packs/Cloudbreak_BP/scripts/*.js "$WORK"/
mkdir -p "$WORK/eco" "$WORK/node_modules"
cp "$HERE"/eco_stubs/*.js "$WORK/eco/"
cp -r "$HERE"/mock/@minecraft "$WORK/node_modules/"
cp "$HERE"/*.test.mjs "$WORK"/
cd "$WORK"
for t in *.test.mjs; do echo "== $t"; node "$t" | tail -1; done
