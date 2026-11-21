#!/usr/bin/env bash
# Builds dist/FactionsEconomy_v<version>.mcaddon (double-click it to import into Minecraft).
# The version comes from the behaviour pack manifest - bump it in BOTH manifests
# (header + module + dependency versions) before every new release.
set -e
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json;print('.'.join(map(str,json.load(open('packs/FactionsEconomy_BP/manifest.json'))['header']['version'])))")
OUT="FactionsEconomy_v${VERSION}.mcaddon"
rm -rf dist && mkdir -p dist/tmp
(cd packs/FactionsEconomy_BP && zip -qr "../../dist/tmp/FactionsEconomy_BP_v${VERSION}.mcpack" .)
(cd packs/FactionsEconomy_RP && zip -qr "../../dist/tmp/FactionsEconomy_RP_v${VERSION}.mcpack" .)
(cd dist/tmp && zip -q "../${OUT}" *.mcpack)
rm -rf dist/tmp
echo "Built dist/${OUT}"
