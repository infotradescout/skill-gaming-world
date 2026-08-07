# Godot Runtime Boundary

The Godot gameplay runtime is deliberately not represented as finished in this v0.1 package.

This folder marks the destination for the first playable vertical slice after the Blender-generated assets are produced and visually accepted.

## Local editor (this machine)

Verified **2026-08-07**:

| Role | Path |
| --- | --- |
| Editor (GUI) | `C:\Users\flavo\Downloads\Godot_v4.7.1-stable_win64.exe\Godot_v4.7.1-stable_win64.exe` |
| Console (CLI / `--version`) | `C:\Users\flavo\Downloads\Godot_v4.7.1-stable_win64.exe\Godot_v4.7.1-stable_win64_console.exe` |
| Zip archive | `C:\Users\flavo\Downloads\Godot_v4.7.1-stable_win64.exe.zip` |

- Version string: `4.7.1.stable.official.a13da4feb` (**PASS** vs required Godot 4.7.1 stable).
- Not on `PATH`; not installed via winget/choco/scoop; no Steam library copy; no Program Files install; registry uninstall keys empty for Godot.
- AppData config present at `%APPDATA%\Godot` (editor settings `editor_settings-4.7.tres`).
- Transient zip extract also seen under `%LOCALAPPDATA%\Temp\…Godot_v4.7.1…` — prefer the Downloads folder above.

Launch helper: `launch-godot.bat` in this directory.

Example CLI check:

```bat
"C:\Users\flavo\Downloads\Godot_v4.7.1-stable_win64.exe\Godot_v4.7.1-stable_win64_console.exe" --version
```

## Target runtime

- Godot 4.7.1 stable;
- one shared match implementation for offline, local-host, and dedicated-server modes;
- custom force-based `RigidBody3D` robot movement;
- server-owned weapon state, collisions, damage, clock, and result;
- modular garage that reconstructs robots only from the approved part catalog;
- WebSocket multiplayer for browser-compatible clients;
- headless authoritative match server;
- no client-trusted mass, power, collision, force, damage, or winner data;
- Free and no-value only.

The exact required vertical slice and acceptance proof are in `../docs/NEXT_RUNTIME_BUILD.md`.
