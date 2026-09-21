#!/usr/bin/env bash
set -euo pipefail
src="$PWD/games/wildlife-ranch/unreal"
out="$PWD/wildlife-preview-public"
# Preserve the existing source-bound asset kit. No Blender rerender/export occurs.
python3 -m unittest discover -s "$src/tests" -v
python3 "$src/Tools/publish_windows_entry.py" prepare "$out"
# Use Microsoft's portable PowerShell only for parser/helper tests on this Linux
# builder. This is deliberately NOT an Unreal or Windows compiler environment.
version=7.4.6
cache="$HOME/.cache/wildlife-pwsh-$version"
mkdir -p "$cache"
if [ ! -x "$cache/pwsh" ]; then
  base="https://github.com/PowerShell/PowerShell/releases/download/v$version"
  curl -fLsS --retry 2 --max-time 180 "$base/powershell-$version-linux-x64.tar.gz" -o "$cache/archive.tar.gz"
  curl -fLsS --retry 2 --max-time 60 "$base/hashes.sha256" -o "$cache/hashes.sha256"
  python3 - "$cache" "$version" <<'PY'
import hashlib,re,sys
from pathlib import Path
p=Path(sys.argv[1]);target='powershell-'+sys.argv[2]+'-linux-x64.tar.gz'
line=next(l for l in (p/'hashes.sha256').read_text().splitlines() if l.strip().endswith(target))
expected=re.search(r'[a-fA-F0-9]{64}',line).group().lower()
assert hashlib.sha256((p/'archive.tar.gz').read_bytes()).hexdigest()==expected,'PowerShell archive checksum mismatch'
PY
  tar -xzf "$cache/archive.tar.gz" -C "$cache"
  chmod u+x "$cache/pwsh"
fi
DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 "$cache/pwsh" -NoProfile -File "$src/tests/Test-BuildSupport.ps1" -Root "$src" | tee "$out/unreal01/entry-tests/powershell.json"
python3 "$src/Tools/publish_windows_entry.py" finish "$out"
# Parse the exact generated payload as well as the source template.
export WILDLIFE_LAUNCH_PAYLOAD="$out/unreal01/entry-tests/launcher-payload.ps1"
DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 "$cache/pwsh" -NoProfile -Command '$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile($env:WILDLIFE_LAUNCH_PAYLOAD,[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|Out-String|Write-Error;exit 1};Write-Output "GENERATED_LAUNCHER_PARSE_PASSED"'
