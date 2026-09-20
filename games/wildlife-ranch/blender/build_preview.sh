#!/usr/bin/env bash
set -euo pipefail
root="$PWD"
source_dir="$root/games/wildlife-ranch/blender"
out="$root/wildlife-preview-public"
mkdir -p "$out/district" "$out/source" "$out/vendor" "$out/macro" "$out/acceptance"
# The one-off WILDLIFE_INSPECT_PUBLISHED mode is retired from this build path.
# New source always creates new native artifacts; historical inspection helpers
# remain separately available and must not relabel earlier scenes as current.
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
"$blender" --background --threads 4 --python "$source_dir/build_refined.py" -- "$out/district"
cp "$source_dir"/*.py "$source_dir/build_preview.sh" "$source_dir/preview.html" "$source_dir/inspect_preview.mjs" "$out/source/"
cp "$source_dir/preview.html" "$out/index.html"
printf 'User-agent: *\nDisallow: /\n' > "$out/robots.txt"
curl --fail --location --retry 2 --max-time 90 https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/dist/model-viewer.min.js -o "$out/vendor/model-viewer.min.js"
curl --fail --location --retry 2 --max-time 60 https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/LICENSE -o "$out/vendor/LICENSE.txt"
printf 'Google model-viewer 4.1.0, Apache-2.0. https://github.com/google/model-viewer\n' > "$out/vendor/NOTICE.txt"
# Macro remains a separate scene. Existence is checked; this does not claim seams
# to the new district have been merged, or that the macro has production detail.
export GITHUB_SHA="${RENDER_GIT_COMMIT:-$(git rev-parse HEAD)}"
"$blender" --background --threads 4 --python "$source_dir/build_world.py" -- --output "$out/macro" --no-render
python3 - "$out" <<'PY'
import json,sys,zipfile,hashlib
from pathlib import Path
p=Path(sys.argv[1]);r=json.loads((p/'district/district_receipt.json').read_text())
assert r['native_reopen_verified'] and len(r['rendered_views'])==4
assert r['revision']=='0.2.1-native-art-refinement'
assert list((p/'macro').glob('*.blend')), 'No native macro world'
for f in p.rglob('*.blend1'):f.unlink()
with zipfile.ZipFile(p/'Wildlife_Blender_World_02.zip','w',zipfile.ZIP_DEFLATED,compresslevel=3) as z:
 for folder in ['district','macro','source']:
  for f in sorted((p/folder).rglob('*')):
   if f.is_file():z.write(f,f.relative_to(p))
package=p/'Wildlife_Blender_World_02.zip'
receipt={'commit':r['source_commit'],'reopened':True,'rendered_views':r['rendered_views'],'package_bytes':package.stat().st_size,'package_sha256':hashlib.sha256(package.read_bytes()).hexdigest()}
(p/'package_receipt.json').write_text(json.dumps(receipt,indent=2))
print('PUBLISHED_NATIVE_WORLD',json.dumps(receipt))
PY
npx playwright install chromium
WILDLIFE_CANDIDATE_DIR="$out" node "$source_dir/inspect_preview.mjs" "$out/acceptance"
