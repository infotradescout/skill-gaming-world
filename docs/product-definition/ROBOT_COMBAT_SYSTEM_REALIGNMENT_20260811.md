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
| Workshop-first builder | Implemented locally | Durable revisions, richer graph editing, accessible browser surface |
| Observable construction consequences | Implemented locally | Canonical server inspection shared by client and match authority |
| Three teaching archetypes | Implemented locally | Guided teaching journeys and conversion into personal revisions |
| Private test bay | Implemented locally | Full test state, restart/recovery truth, recorded test evidence |
| Online 1v1 | Transport handshake only | Match allocation, two clients, ready gate, authoritative commands, reconnect/disconnect outcome |
| Localized damage and explanation | Simplified local integrity log | Component damage, structural effects, causal timeline, rebuild questions |
| Build history | Local last-valid save only | Account-owned durable revisions, hashes, rollback, concurrent-write protection |
| SGW entry surface | Existing marketing/app shell | Browser game entry that reaches the real runtime and reflects actual availability |
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
   runtime loading, truthful unavailable/error states, and no stale Bay 13 claims.
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

Until that journey is reachable and verified, the product is not complete.
