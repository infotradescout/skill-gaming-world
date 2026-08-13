# Robot Combat System Realignment

**Status:** active implementation map; not a completion claim
**Authority:** current owner direction plus the Robot Combat owner seed, option-selection record, and design requirements
**Repository:** `skill-gaming-world`
**Game key:** `SGW_ROBOT_COMBAT`

## The actual product

Skill Gaming World is the surface. Robot Combat is the product behind it.

The primary player is an independent builder. Their job is to design a machine,
understand what the design changes, test it privately, fight another builder,
inspect what failed, and rebuild from evidence. The workshop and arena are equal
halves of the experience. Starter archetypes teach the language of the system;
they are not the product's permanent roster.

The free game path must remain free of wagering, deposits, prizes, payouts,
redeemable value, and purchased performance advantage. Rules, content names,
final arena identity, progression, social systems, and public legal positioning
remain replaceable until explicitly approved.

## What the previous slice actually proved

The isolated Godot branch proved a local visual loop: a few procedural modules can
be assembled, inspected, driven, damaged, and reset. It did not prove a product.
It had no durable build history, real player identity, two-player match lifecycle,
server-backed authority, browser reachability from the SGW surface, or production
operations. Its correct classification is **local prototype evidence**.

## Reality map

| Product requirement | Current highest proven state | Missing before this is a real product |
| --- | --- | --- |
| Workshop-first builder | Authenticated browser workshop with durable revisions | Richer graph editing, guided teaching journeys, accessibility hardening |
| Observable construction consequences | Canonical server inspection shared by builds and match authority | More physical consequence types and recorded private-test evidence |
| Three teaching archetypes | Implemented as editable browser starters | Guided teaching journeys and conversion into personal revisions |
| Private test bay | Browser private-test authority with drive, contact, weapon, reset, and consequence report | Hosted test operations, richer physics/consequence types, and production evidence |
| Online 1v1 | Demo-mode two-browser lifecycle with join, ready, commands, terminal state, and disconnect outcome | Production database/live concurrency/reconnect proof and match allocation |
| Localized damage and explanation | Server component damage, event snapshots, terminal report, and rebuild questions | Structural effects, causal timeline UI, and richer weapon/contact rules |
| Build history | Account-owned revisions, hashes, rollback-ready records, and concurrent-write protection in configured mode | Production migration/deployment proof and richer history UX |
| SGW entry surface | Authenticated browser workshop → authority arena → match-aware exported 3D mirror | Hosted Render availability, production persistence, and live concurrency proof |
| Operations | Local scripts | Match authority deployment, observability, load/concurrency tests, release proof |

## Implementation order

1. **Authority core** — part graph, inspection, hashes, match state machine, event contract.
2. **Durable player layer** — build roots, revisions, ownership, last-valid recovery,
   match records, append-only command events.
3. **Playable workshop and arena** — graph editing, test state, component assembly,
   readable damage, recovery, and post-match rebuild flow.
4. **Online match** — waiting room, opponent join, both-ready gate, authoritative
   input, clock, terminal outcomes, disconnect/reconnect handling.
5. **SGW surface** — one route into the game, authenticated player handoff, browser
   authority arena, match-aware exported 3D mirror, truthful boundary/error states,
   and no stale Bay 13 marketing claims.
6. **Content and operations** — replaceable arena/content assets, audio and feedback,
   accessibility, telemetry, deployment, concurrency evidence, and release gates.

## Current build boundary

This branch is allowed to implement the free Robot Combat authority and player
experience. It is not allowed to silently invent wagering, prizes, ranked value,
legal play, final public title, or production availability. Any rule that remains
provisional must live behind a versioned contract so it can be replaced without
rewriting player data or match evidence.

The completion bar is an observable end-to-end journey:

`SGW entry → authenticated player → workshop → valid revision → private test → opponent wait → both ready → authoritative fight → outcome → damage report → rebuild`

The browser authority journey, private test bay, and match-aware 3D mirror are
now reachable and verified in demo mode. The product is still not complete: the
hosted Render path, production persistence and concurrency proof, richer
physical consequence rules, and operations evidence remain open.
