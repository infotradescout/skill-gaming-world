# Bay 13 Runtime Completion Report

**Candidate date:** 2026-08-09

**Engine:** Godot 4.7.1 stable

**Offering:** Free / No Value local training

## Outcome

Bay 13: The Scrapyard now provides the complete first-player loop: launch,
choose one of three starter machines, drive and use its action, fight a local
training opponent, finish or reset the match, rebuild in the garage, see live
server totals, reject invalid designs, and save/load the exact accepted
blueprint into the arena.

The web application exposes the release from the public game floor, the public
Bay 13 page, and the authenticated app shell. The checked-in Godot Web export
is served at `/games/bay-13/index.html`.

## Automated evidence

| Gate | Result |
| --- | --- |
| Godot parser and project load | Pass on 4.7.1 stable |
| Blueprint, catalog, authority, safety, and persistence assertions | 32 / 32 pass |
| Live arena, spawn, action, clock, damage, and reset assertions | 12 / 12 pass |
| Two-process WebSocket server/client handshake | Pass |
| Godot Web export | Pass; HTML, JavaScript, PCK, and WebAssembly present |
| Web package audit | 0 vulnerabilities at the high threshold |
| ESLint and TypeScript | Pass |
| Web unit/integration suite | 108 / 108 pass across 25 files |
| Next.js configured production build | Pass; 49 routes compiled |
| Production HTTP route and asset smoke test | Pass |
| WebAssembly response | `application/wasm`, byte range returns HTTP 206 |

The Godot suite is available through `npm run robot-combat:verify-runtime`.
The browser artifact is reproduced through `npm run robot-combat:export-web`.
The complete web gate is `npm run check`.

## Authority and value boundaries

- Clients submit ordered throttle, steer, and weapon intent only.
- Blueprint mass, power, limits, identity, and reconstruction are calculated by
  the authority from the approved catalog.
- Position, collision, damage, clock, score, and winner values are not accepted
  from a client.
- Money, price, paid entry, wager, payout, prize, redemption, and Legal Play
  fields are rejected from Free-side blueprints.
- Hosted matchmaking, private rooms, reconnects, spectators, public rankings,
  and a production match-server fleet are not represented as available.

## Explicit deferrals

The playable runtime uses original procedural Godot geometry and materials.
The repository retains the previously captured Blender 5.2 visual-foundation
evidence, but this candidate does not claim that the Blender generator was
rerun or that its GLB outputs were imported into Godot. Blender cannot start in
the restricted Linux verification container, so that asset-pipeline acceptance
item remains open for a compatible workstation.

The WebSocket transport and server authority boundary are implemented and
smoke-tested, but the public release is local training only. Hosted PvP remains
a separately deployed and tested future capability.
