#!/usr/bin/env bash
set -euo pipefail
# Correct the delivery page without pretending source files are a game, and keep
# every existing pinned download available. No art or native-code build is run.
src="$PWD/games/wildlife-ranch/unreal"
out="$PWD/wildlife-preview-public"
python3 -m unittest discover -s "$src/tests" -p test_delivery_page.py -v
python3 "$src/Tools/publish_delivery_status.py" "$out"
npx playwright install chromium
node "$src/Tools/inspect_delivery.mjs" "$out"
