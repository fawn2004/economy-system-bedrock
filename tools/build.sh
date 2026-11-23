#!/usr/bin/env bash
# Builds dist/SkyblockEconomy_v<version>.mcaddon (double-click it to import into Minecraft).
# The version comes from the behaviour pack manifest - bump it in BOTH manifests
# (header + module + dependency versions) before every new release.
set -e
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json;print('.'.join(map(str,json.load(open('packs/SkyblockEconomy_BP/manifest.json'))['header']['version'])))")
OUT="SkyblockEconomy_v${VERSION}.mcaddon"
rm -rf dist && mkdir -p dist/tmp
(cd packs/SkyblockEconomy_BP && zip -qr "../../dist/tmp/SkyblockEconomy_BP_v${VERSION}.mcpack" .)
(cd packs/SkyblockEconomy_RP && zip -qr "../../dist/tmp/SkyblockEconomy_RP_v${VERSION}.mcpack" .)
# chat ranks pack (Beta APIs) - also shipped on its own so it can be left out
(cd packs/SkyblockEconomy_Chat_BP && zip -qr "../../dist/tmp/SkyblockEconomy_Chat_v${VERSION}.mcpack" .)
cp "dist/tmp/SkyblockEconomy_Chat_v${VERSION}.mcpack" dist/
(cd dist/tmp && zip -q "../${OUT}" *.mcpack)
rm -rf dist/tmp
echo "Built dist/${OUT}"
