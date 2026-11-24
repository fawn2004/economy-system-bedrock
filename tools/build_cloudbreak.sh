#!/usr/bin/env bash
# Builds dist/Cloudbreak_v<version>.mcaddon (double-click it to import into Minecraft).
# The version comes from the behaviour pack manifest - bump it in BOTH manifests
# (header + module + dependency versions) before every new release.
set -e
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json;print('.'.join(map(str,json.load(open('packs/Cloudbreak_BP/manifest.json'))['header']['version'])))")
OUT="Cloudbreak_v${VERSION}.mcaddon"
mkdir -p dist && rm -rf dist/cbtmp && mkdir -p dist/cbtmp
(cd packs/Cloudbreak_BP && zip -qr "../../dist/cbtmp/Cloudbreak_BP_v${VERSION}.mcpack" .)
(cd packs/Cloudbreak_RP && zip -qr "../../dist/cbtmp/Cloudbreak_RP_v${VERSION}.mcpack" .)
rm -f "dist/${OUT}" && (cd dist/cbtmp && zip -q "../${OUT}" *.mcpack)
rm -rf dist/cbtmp
echo "Built dist/${OUT}"
