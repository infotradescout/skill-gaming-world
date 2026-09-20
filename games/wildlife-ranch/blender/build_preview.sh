#!/usr/bin/env bash
set -euo pipefail
root="$PWD"
source_dir="$root/games/wildlife-ranch/blender"
out="$root/wildlife-preview-public"
mkdir -p "$out/district" "$out/source" "$out/vendor"
if [ "${WILDLIFE_INSPECT_PUBLISHED:-0}" = 1 ]; then
 python3 "$source_dir/inspect_published.py" "$out"
else
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
# Source is evaluated in a disposable build process, never in an existing editor.
# Do not expose repository files, secrets or the Blender executable in public output.
"$blender" --background --threads 4 --python "$source_dir/build_district.py" -- "$out/district"
fi
cp "$source_dir/build_district.py" "$source_dir/build_preview.sh" "$source_dir/preview.html" "$out/source/"
cp "$source_dir/preview.html" "$out/index.html"
printf 'User-agent: *\nDisallow: /\n' > "$out/robots.txt"
curl --fail --location --retry 2 --max-time 90 https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/dist/model-viewer.min.js -o "$out/vendor/model-viewer.min.js"
printf 'Google model-viewer 4.1.0, Apache-2.0. https://github.com/google/model-viewer\n' > "$out/vendor/NOTICE.txt"
# The previous 20 km macro scene remains reproducible from the original source.
# Build it without rendering; the detailed area is explicitly NOT yet seam-stitched.
if [ "${WILDLIFE_INSPECT_PUBLISHED:-0}" != 1 ]; then
mkdir -p "$out/macro"
export GITHUB_SHA="${RENDER_GIT_COMMIT:-$(git rev-parse HEAD)}"
"$blender" --background --threads 4 --python "$source_dir/build_world.py" -- --output "$out/macro" --no-render
fi
cp "$source_dir/build_world.py" "$source_dir/verify_world.py" "$out/source/"
if [ "${WILDLIFE_INSPECT_PUBLISHED:-0}" != 1 ]; then
python3 - "$out" <<'PY'
import hashlib,json,sys,zipfile
from pathlib import Path
p=Path(sys.argv[1]);r=json.loads((p/'district/district_receipt.json').read_text())
assert r['native_reopen_verified'] and len(r['rendered_views'])==4
assert list((p/'macro').glob('*.blend')), 'No native macro world'
# Do not bundle .blend1 backup files or build executables.
for f in p.rglob('*.blend1'):f.unlink()
with zipfile.ZipFile(p/'Wildlife_Blender_World_02.zip','w',zipfile.ZIP_DEFLATED,compresslevel=3) as z:
 for folder in ['district','macro','source']:
  for f in sorted((p/folder).rglob('*')):
   if f.is_file():z.write(f,f.relative_to(p))
print('PUBLISHED_NATIVE_WORLD',json.dumps({'commit':r['source_commit'],'reopened':True,'rendered_views':r['rendered_views'],'package_bytes':(p/'Wildlife_Blender_World_02.zip').stat().st_size}))
PY
fi

# Browser acceptance runs only on the exact previously published native artifacts.
if [ "${WILDLIFE_INSPECT_PUBLISHED:-0}" = 1 ]; then
 mkdir -p "$out/acceptance"
 npx playwright install chromium
 node "$source_dir/inspect_preview.mjs" "$out/acceptance"
fi
curl --fail --location --retry 2 --max-time 60 https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/LICENSE -o "$out/vendor/LICENSE.txt"
