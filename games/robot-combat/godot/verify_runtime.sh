#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../../.." && pwd)"
godot_bin="${GODOT_BIN:-$repo_root/.tooling/godot/Godot_v4.7.1-stable_linux.x86_64}"
xdg_data="${XDG_DATA_HOME:-$repo_root/.tooling/xdg-data}"
xdg_config="${XDG_CONFIG_HOME:-$repo_root/.tooling/xdg-config}"

if [[ ! -x "$godot_bin" ]]; then
  echo "Godot 4.7.1 executable not found: $godot_bin" >&2
  exit 1
fi

export XDG_DATA_HOME="$xdg_data"
export XDG_CONFIG_HOME="$xdg_config"

parse_log="$(mktemp "$script_dir/.tmp-parse.XXXXXX")"
test_log="$(mktemp "$script_dir/.tmp-tests.XXXXXX")"
scene_log="$(mktemp "$script_dir/.tmp-scene.XXXXXX")"
network_tmp="$(mktemp -d "$script_dir/.tmp-network-smoke.XXXXXX")"
server_log="$network_tmp/server.log"
client_log="$network_tmp/client.log"
port="${BAY13_NETWORK_SMOKE_PORT:-9247}"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
  fi
  rm -rf -- "$network_tmp"
  rm -f -- "$parse_log" "$test_log" "$scene_log"
}
trap cleanup EXIT

"$godot_bin" --headless --editor --path "$script_dir" --quit-after 2 2>&1 | tee "$parse_log"
if grep -Eq "^ERROR:|SCRIPT ERROR|Parse Error|Compile Error|Failed to load script" "$parse_log"; then
  exit 1
fi

"$godot_bin" --headless --path "$script_dir" --script res://tests/test_runner.gd 2>&1 | tee "$test_log"
grep -q "ROBOT_COMBAT_WORKSHOP_ASSERTIONS:16:PASS" "$test_log"
if grep -Eq "^ERROR:|SCRIPT ERROR|Parse Error|Compile Error|ROBOT_COMBAT_TEST_FAILURE" "$test_log"; then
  exit 1
fi

"$godot_bin" --headless --path "$script_dir" --script res://tests/scene_test_runner.gd 2>&1 | tee "$scene_log"
grep -q "ROBOT_COMBAT_SCENE_ASSERTIONS:15:PASS" "$scene_log"
if grep -Eq "^ERROR:|SCRIPT ERROR|Parse Error|Compile Error|ROBOT_COMBAT_SCENE_FAILURE" "$scene_log"; then
  exit 1
fi

"$godot_bin" --headless --path "$script_dir" -- --network-server "--port=$port" >"$server_log" 2>&1 &
server_pid=$!

for _ in $(seq 1 80); do
  if grep -q "NETWORK_SERVER_LISTENING" "$server_log"; then
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    sed -n '1,240p' "$server_log" >&2
    exit 1
  fi
  sleep 0.1
done

grep -q "NETWORK_SERVER_LISTENING" "$server_log"
"$godot_bin" --headless --path "$script_dir" -- --network-client "--port=$port" >"$client_log" 2>&1
wait "$server_pid"
server_pid=""

grep -q "NETWORK_SERVER_PEER_CONNECTED" "$server_log"
grep -q "NETWORK_SERVER_HANDSHAKE_COMPLETE" "$server_log"
grep -q "NETWORK_CLIENT_CONNECTED" "$client_log"
grep -q "NETWORK_CLIENT_HANDSHAKE_COMPLETE" "$client_log"
if grep -Eq "^ERROR:|SCRIPT ERROR|Parse Error|Compile Error|NETWORK_.*_FAILED" "$server_log" "$client_log"; then
  exit 1
fi

sed -n '1,240p' "$server_log"
sed -n '1,240p' "$client_log"
echo "BAY13_WEBSOCKET_HANDSHAKE:PASS"
