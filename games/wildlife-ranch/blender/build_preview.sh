#!/usr/bin/env bash
set -euo pipefail
# Continue native integration without touching existing Blender art or rerendering.
# Builds a verified local Windows launcher, not a cloud-compiled game executable.
exec bash games/wildlife-ranch/unreal/Tools/build_windows_entry.sh
