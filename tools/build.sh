#!/usr/bin/env bash
# Builds dist/FactionsEconomy.mcaddon (double-click it to import into Minecraft)
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/tmp
(cd packs/FactionsEconomy_BP && zip -qr ../../dist/tmp/FactionsEconomy_BP.mcpack .)
(cd packs/FactionsEconomy_RP && zip -qr ../../dist/tmp/FactionsEconomy_RP.mcpack .)
(cd dist/tmp && zip -q ../FactionsEconomy.mcaddon *.mcpack)
rm -rf dist/tmp
echo "Built dist/FactionsEconomy.mcaddon"
