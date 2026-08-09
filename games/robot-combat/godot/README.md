# Bay 13 Godot Runtime

This directory contains the playable **Bay 13: The Scrapyard** vertical slice for Godot 4.7.1. It runs as the same project in the editor, as a headless authority, and as the web export served by Skill Gaming World.

## Included slice

- three starter machines: Yard Mule (Rammer), Keelcutter (Ripper), and Pilebreaker (Maul);
- force-based `RigidBody3D` driving with keyboard, gamepad, and touch input;
- a three-minute local training match with damage, knockout, arena-out, decision, draw, and reset outcomes;
- a modular garage for chassis, wheels, front assembly, weapon, and paint;
- catalog, mass, power, size, weapon-count, attachment, overlap, and prohibited-value validation;
- canonical blueprint hashes plus exact local save/load reconstruction;
- server-authoritative WebSocket intent and snapshot transport;
- a browser export at `/games/bay-13/index.html`;
- Free / No Value product treatment. Paid entry and valuable prizes remain unavailable.

The current public slice is local training. The network transport is implemented and smoke-tested, but matchmaking, session allocation, abuse controls, and hosted PvP operations remain a future release boundary.

## Verify

Install Godot 4.7.1 and either set `GODOT_BIN` or place the Linux executable at `.tooling/godot/Godot_v4.7.1-stable_linux.x86_64` from the repository root.

```bash
npm run robot-combat:verify-runtime
npm run robot-combat:export-web
```

The runtime verification command fails on parser errors and requires all of the following:

- 32 blueprint, safety, persistence, and rules assertions;
- 12 live scene assertions;
- a successful two-process WebSocket connection and handshake.

The export command writes the checked-in browser build under `public/games/bay-13/` and verifies that the HTML, JavaScript, package, and WebAssembly outputs are nonempty.

## Source map

| Area | Source |
| --- | --- |
| App flow, menu, HUD, garage, touch UI | `scripts/main.gd` |
| Arena geometry and safety enclosure | `scripts/arena_builder.gd` |
| Robot movement and construction | `scripts/robot_body.gd` |
| Match authority and training opponent | `scripts/match_controller.gd` |
| Blueprint rules and persistence | `scripts/blueprint_service.gd` |
| WebSocket authority/client bridge | `scripts/network_bridge.gd` |
| Automated runtime proof | `tests/` and `verify_runtime.sh` |

The governing product requirements remain in [`../../../docs/NEXT_RUNTIME_BUILD.md`](../../../docs/NEXT_RUNTIME_BUILD.md), with arena canon in [`../../../docs/ARENA_STORY_BIBLE.md`](../../../docs/ARENA_STORY_BIBLE.md).
