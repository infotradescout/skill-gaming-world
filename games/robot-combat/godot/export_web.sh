#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../../.." && pwd)"
godot_bin="${GODOT_BIN:-$repo_root/.tooling/godot/Godot_v4.7.1-stable_linux.x86_64}"
output_dir="$repo_root/public/games/bay-13"
parts_dir="$script_dir/web-export"

if [[ ! -x "$godot_bin" ]]; then
  echo "Godot 4.7.1 executable not found: $godot_bin" >&2
  exit 1
fi

export XDG_DATA_HOME="${XDG_DATA_HOME:-$repo_root/.tooling/xdg-data}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$repo_root/.tooling/xdg-config}"

mkdir -p "$output_dir"
"$godot_bin" --headless --editor --path "$script_dir" --quit-after 2
"$godot_bin" --headless --path "$script_dir" --export-release Web "$output_dir/index.html"
perl -0pi -e 's/\n+\z/\n/' "$output_dir/index.html"

mkdir -p "$parts_dir"
find "$parts_dir" -maxdepth 1 -type f -name 'index.wasm.gz.part-*' -delete
gzip -9 -n -c "$output_dir/index.wasm" \
  | split -b 700K -d -a 2 - "$parts_dir/index.wasm.gz.part-"

test -s "$output_dir/index.html"
test -s "$output_dir/index.js"
test -s "$output_dir/index.pck"
test -s "$output_dir/index.wasm"
test "$(find "$parts_dir" -maxdepth 1 -type f -name 'index.wasm.gz.part-*' | wc -l)" -gt 0

printf 'BAY13_WEB_EXPORT:PASS\n'
find "$output_dir" -maxdepth 1 -type f -printf '%f %s bytes\n' | sort
printf 'BAY13_WASM_SOURCE_PARTS:%s\n' "$(find "$parts_dir" -maxdepth 1 -type f -name 'index.wasm.gz.part-*' | wc -l)"
