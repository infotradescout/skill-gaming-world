#!/usr/bin/env bash
set -euo pipefail
# Continue into Unreal using the exact existing Blender scene. This path exports
# assets, preserves the live art files, and adds an honestly labeled source kit.
# It does not rerender artwork or pretend Render's Blender builder is Unreal.
exec bash games/wildlife-ranch/unreal/Tools/build_handoff.sh
