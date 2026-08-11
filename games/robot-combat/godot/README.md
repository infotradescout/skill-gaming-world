# Robot Combat prototype

This is the local playable prototype for the game surfaced by Skill Gaming World. SGW is the front door; Robot Combat is the thing being played.

## Included loop

- Workshop-first entry with three dismantleable teaching fixtures.
- Replaceable chassis, wheel set, front assembly, weapon, battery, paint, and mount positions.
- A rendered build schematic plus inspection of mass, power, balance, footprint, clearance, connections, traction, and force path.
- Specific invalid-build explanations. An invalid draft never overwrites the last-valid revision.
- Named local revisions and return-to-last-valid recovery.
- Private test bay with direct driving, contact, weapon action, and reset.
- Local 1v1 arena using the same server-rebuilt personal blueprint as the workshop.
- Post-match damage evidence and rebuild questions that return to the workshop.
- Free-side boundary only: no wagering, entry fee, cash, prize, payout, ranking, or regulated-play behavior.

## Deliberate boundary

This checkout proves the local build/test/fight/learn/rebuild loop. It does not prove hosted online PvP, matchmaking, persistence, anti-cheat, production deployment, or final public title/venue canon. Render and the SGW web routes remain separate until this local slice is reviewed and explicitly integrated.

The arena geometry and names inherited from earlier work are provisional prototype content and are intentionally replaceable.

## Verify

With Godot 4.7.1 available as `GODOT_BIN`:

```bash
npm run robot-combat:verify-runtime
```

The local proof currently includes 16 blueprint/workshop assertions and 15 live scene assertions. The verification script also retains the existing WebSocket handshake smoke as transport evidence; that smoke is not hosted-match proof.

For a rendered arena check on desktop, run the project with the user argument `--demo-arena`:

```text
Godot --path games/robot-combat/godot -- --demo-arena
```

## Source map

| Area | Source |
| --- | --- |
| Workshop, revisions, test/arena/report flow | `scripts/main.gd` |
| Build rules, inspection, server rebuild, persistence | `scripts/blueprint_service.gd` |
| Shared procedural build assembly | `scripts/robot_assembly.gd` |
| Workshop schematic | `scripts/robot_schematic.gd` |
| Arena robot physics and damage log | `scripts/robot_body.gd` |
| Local match authority and outcome report data | `scripts/match_controller.gd` |
| Arena geometry and safety enclosure | `scripts/arena_builder.gd` |
| Automated runtime proof | `tests/` and `verify_runtime.sh` |

The implementation intent lock is [`../../../docs/product-definition/ROBOT_COMBAT_IMPLEMENTATION_INTENT_LOCK_20260811.md`](../../../docs/product-definition/ROBOT_COMBAT_IMPLEMENTATION_INTENT_LOCK_20260811.md).
