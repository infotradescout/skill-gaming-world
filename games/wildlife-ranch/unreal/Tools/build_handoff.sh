#!/usr/bin/env bash
set -euo pipefail
root="$PWD"
source_dir="$root/games/wildlife-ranch/unreal"
out="$root/wildlife-preview-public"
python3 -m unittest discover -s "$source_dir/tests" -v
python3 "$source_dir/Tools/stage_handoff.py" prepare "$out"
version=4.5.3
cache="${HOME}/.cache/wildlife-blender-$version"
archive="blender-$version-linux-x64.tar.xz"
mkdir -p "$cache"
if [ ! -x "$cache/blender-$version-linux-x64/blender" ]; then
 curl --fail --location --retry 2 --connect-timeout 20 --max-time 240 "https://download.blender.org/release/Blender4.5/$archive" -o "$cache/$archive"
 curl --fail --location --retry 2 --connect-timeout 20 --max-time 60 "https://download.blender.org/release/Blender4.5/blender-$version.sha256" -o "$cache/official.sha256"
 (cd "$cache"; grep " $archive\$" official.sha256 > selected.sha256; test -s selected.sha256; sha256sum -c selected.sha256; tar -xf "$archive")
fi
blender="$cache/blender-$version-linux-x64/blender"
"$blender" --background --disable-autoexec --threads 4 --python-exit-code 17 --python "$source_dir/Tools/export_district.py" -- "$out/art03/Wildlife_Lodge_Shore_03.blend" "$out/unreal01/project/WildlifeReserve/InputBundle"
python3 "$source_dir/Tools/stage_handoff.py" finish "$out"
