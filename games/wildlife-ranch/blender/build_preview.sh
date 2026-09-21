#!/usr/bin/env bash
set -euo pipefail
root="$PWD"
source_dir="$root/games/wildlife-ranch/blender"
out="$root/wildlife-preview-public"
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
python3 "$source_dir/art03_assets.py"
if [ "${WILDLIFE_ART03_INSPECT_ONLY:-0}" = 1 ]; then
 "$blender" --background --disable-autoexec --threads 4 --python-exit-code 17 --python "$source_dir/art03_inspect.py"
 echo 'ASSET_INSPECTION_ONLY: keeping public preview unchanged; no art publication.'
 exit 3
fi
mkdir -p "$out/art03" "$out/source" "$out/acceptance03"
"$blender" --background --disable-autoexec --threads 4 --python-exit-code 17 --python "$source_dir/art03_replace.py" -- "$out/art03"
python3 "$source_dir/art03_publish.py" "$out"
npx playwright install chromium
node "$source_dir/art03_browser.mjs" "$out"
