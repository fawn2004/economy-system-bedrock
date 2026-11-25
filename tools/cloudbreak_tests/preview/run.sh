#!/usr/bin/env bash
# Draws every Cloudbreak screen from the REAL menu code, run against a fake world.
#   tools/cloudbreak_tests/preview/run.sh [out_dir]
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../.."
OUT="${1:-$ROOT/dist/previews}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r "$ROOT"/packs/Cloudbreak_BP/scripts/* "$WORK"/
mkdir -p "$WORK/node_modules"
cp -r "$HERE"/../mock/@minecraft "$WORK/node_modules/"
cat "$HERE/server_extra.js" >> "$WORK/node_modules/@minecraft/server/index.js"
cp "$HERE/forms.mjs" "$WORK/"
(cd "$WORK" && node forms.mjs > forms.json)
mkdir -p "$OUT"
python3 "$ROOT/tools/build_cloudbreak_screens.py" preview "$WORK/forms.json" "$OUT"
