#!/usr/bin/env bash
set -euo pipefail
root="$PWD"
source_dir="$root/games/wildlife-ranch/blender"
out="$root/wildlife-preview-public"
# Historical WILDLIFE_ART03_LIVE_REVIEW_ONLY is retired from normal publishing.
# Its previous read-only check did not replace the live site or alter native art.
# This pass reuses the exact packed 03 scene, not another download/rebuild of assets.
version=4.5.3
cache="${HOME}/.cache/wildlife-blender-$version"
archive="blender-$version-linux-x64.tar.xz"
mkdir -p "$cache"
if [ ! -x "$cache/blender-$version-linux-x64/blender" ]; then
 curl --fail --location --retry 2 --connect-timeout 20 --max-time 240 "https://download.blender.org/release/Blender4.5/$archive" -o "$cache/$archive"
 curl --fail --location --retry 2 --connect-timeout 20 --max-time 60 "https://download.blender.org/release/Blender4.5/blender-$version.sha256" -o "$cache/official.sha256"
 ( cd "$cache"; grep " $archive\$" official.sha256 > selected.sha256; test -s selected.sha256; sha256sum -c selected.sha256; tar -xf "$archive" )
fi
blender="$cache/blender-$version-linux-x64/blender"
"$blender" --version
PYTHONPATH="$source_dir" python3 - <<'PY'
from art03_assets import ROOT,request
# All images needed to render are packed in the immutable native input. The
# registry is attribution/provenance, not an instruction to redownload 50 files.
if not (ROOT/'asset_registry.json').is_file():
 with request('https://wildlife-reserve-world-preview.onrender.com/art03/asset_registry.json') as r:
  (ROOT/'asset_registry.json').write_bytes(r.read())
PY
mkdir -p "$out/art03" "$out/art03_base" "$out/source03" "$out/acceptance03"
"$blender" --background --disable-autoexec --threads 4 --python-exit-code 17 --python-expr "import sys; sys.path.insert(0, r'$source_dir')" --python "$source_dir/art03_composition.py" -- "$out/art03"
# Retain the immutable parent at a stable URL so a future cache miss cannot
# accidentally read this revision's output as its own input.
asset_cache="${WILDLIFE_ASSET_CACHE:-${HOME}/.cache/wildlife-art03}"
cp "$asset_cache/input/Environment03_source.blend" "$out/art03_base/Wildlife_Lodge_Shore_03.blend"
python3 "$source_dir/art03_publish.py" "$out"
cp "$source_dir/build_preview.sh" "$out/source03/"
npx playwright install chromium
node "$source_dir/art03_browser.mjs" "$out"
