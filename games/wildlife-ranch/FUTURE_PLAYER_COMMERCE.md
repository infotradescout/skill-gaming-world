# Future player commerce — Frontline reuse and Blender-first continuity

Status: EXPLORATORY OWNER DIRECTION, not an activated marketplace or final economy.
Recorded: 2026-09-20.
Owning task: original wildlife-reserve game, PR #43.
Pre-update branch head: cfe09b750d0bad766560d3d0a96c2bad27fa2de1.

## Owner direction and delivery order

The owner wants all of their games to be capable of relevant player-to-player
sales in the future. In this game, explicit examples are selling a ranch and
selling a lease to another player. This is a loose idea to preserve and develop,
not permission to invent a final business model or activate payments. Selective
Intelligence and Infinity must connect new work to the engines already built for
Frontline instead of independently rebuilding capabilities.

The latest immediate production request remains: BUILD THE WORLD IN BLENDER
FIRST. Produce an editable world file, not just an image resembling Blender,
another management dashboard, a marketplace service, or an Unreal-only substitute.
The native playable hunting / ecology / built-in GrindZone direction remains the
subsequent integration target. This note adds future compatibility requirements;
it does not put commerce implementation ahead of world creation.

The existing PRODUCT_CONTRACT.md remains governing for COTW-quality ambitions,
WMA-scale geography, permanent individual wildlife, reproduction, and integrated
GrindZone. Final acreage, geography and game title remain open. The prior
100,000-acre suggestion is not an approved fixed specification.

## Proposed product model, not locked mechanics

A player can improve a reserve over multiple generations, sell access to that
existing reserve, or transfer that particular reserve to another player. What
is valuable is the developed habitat, infrastructure and documented history,
not a newly generated copy of the seller's property or a guaranteed trophy.

A ranch sale and a lease are separate rights:

| Candidate transaction | Proposed meaning | Must not silently imply |
| --- | --- | --- |
| Ranch sale | Transfer ownership/control of an identified persistent ranch instance, with agreed included improvements and existing obligations | Duplicate the ranch state, replace wildlife, sell the user's account, transfer their private journal/photos, or erase leases |
| Player lease | Grant an identified player time- and area-limited permissions in that same world | Transfer ownership, reserve an animal's survival, grant unlimited harvests, or give access outside the terms |
| NPC lease | Use the existing planned NPC visitor workflow with comparable scope and capacity constraints | Create a separate ecology or consume the same available access twice |

Other games should expose only assets or access rights relevant to their own
play. This direction does not authorize selling every item, adding pay-to-win
advantages, or imposing ranch mechanics on Frontline or other titles.

Proposed common transaction responsibilities: identify asset and current owner;
validate a listing; define access/transfer terms; reserve the applicable capacity;
authorize the buyer's action; settle under a selected value model; commit ownership
or access exactly once; keep receipts and support recovery. These describe needed
capabilities, NOT functions already found in Frontline or Infinity.

## Reuse evidence — exact inspected scope

Frontline's published branch listing returned master only at:
`dab4aa319e1dfa057b225c2e973278e732cb70fa`.

| Source | What was actually read | Reuse interpretation |
| --- | --- | --- |
| Frontline README.md, blob 0c59339ec38fcd1371568ecaccf8eae06bc6280f | Unreal project and planned seeded procedural-world direction | Existing project baseline to evaluate; README is not execution proof |
| Frontline UnrealProject/FrontlineWarfare/Source/FrontlineWarfare/Private/FrontlineBRGameMode.cpp, blob 10cc1d741279ba11a960055f8d26741c46ff359c | First-person pawn setup, login/input setup, navigation-based initial bot placement, match phase timer and level reload | Inspect/extract only compatible reusable behavior; do not copy match lifecycle as persistent ecology |
| Frontline UnrealProject/FrontlineWarfare/Source/FrontlineWarfare/Private/FrontlineBRGameState.cpp, blob c7b66fcb4ca729a4f87ff5f6224f3b7e62ce3617 | Replicated match phase, timer, alive counts and winner label | A replication reference, not persistent ownership, identity, a transaction ledger or a validated marketplace |
| Infinity packages/contracts/src/types.ts, blob 11a94c7a841f96aea18503870865e2abdbf1dfbe | Tenant/object references, object versions, idempotency keys, attribution/conversion evidence; payoutTriggered/paymentTriggered false | Candidate reusable reference and evidence types behind a game adapter; no source grants ranch-sale authorization |
| Infinity docs/capability-ownership.md, blob c9ff7ad1713bf183e1816fbf931b8daafc47e3dc | Catalog/orchestration/adapters belong to Infinity; SI stays a separately pinned canonical capability | Do not fork SI or treat an attribution signature as ownership authority |
| SI skills/selective-intelligence/SKILL.md, blob d8f0f375aeaef01a5fffe22ca214ad7506c0a58c | Resume-first routing, canonical-owner reuse, scoped evidence and distinct delivery states | Govern selection, adaptation, verification and continuity; not a commerce runtime |

Repositories: infotradescout/frontline, infotradescout/tradescout-infinity,
and infotradescout/Selective-Intelligence. File blob identities above pin the
content inspected; they are not installed-version or deployed-runtime receipts.
Infinity's ownership documentation uses the older Platynum-47 SI path; the read
SI README identifies infotradescout/Selective-Intelligence as canonical. Resolve
and verify actual release metadata before an adapter installation; do not use a
historical namespace alone as a compatibility claim.

No reusable ranch-ownership, P2P settlement or lease engine was established by this
bounded source inspection. This is NOT a claim that the owner's engines do not
exist in another workspace, repository, plugin or unpublished candidate. Before
building those capabilities, locate the named Frontline/shared engine owner and
verify its implementation and consumers. Do not substitute a new service because
the first checked repository lacks the desired module.

No Frontline C++ build or multiplayer execution was run. Blueprint binaries and
unpublished/local work were not inspected. No Infinity/SI install or live connection
was performed. Source presence, compatibility and runtime acceptance are separate.

## Proposed ownership of responsibilities

- Frontline/shared engines: first reuse targets for existing compatible gameplay,
  world, networking, persistence and eventual commerce capabilities, once located.
  A new shared module requires a demonstrated gap and an explicit canonical owner.
- Infinity: capability discovery/composition, versioned references and evidence
  adapters where its current contracts fit. It is not automatically the wallet,
  property registry, transaction authority or permission system.
- SI: preserve the full game requirement, select existing owners, prevent parallel
  reimplementations, retain checkpoints, and require evidence appropriate to each
  delivery claim. Following the skill in this task is not universal enforcement.
- Game runtime and its eventually selected authoritative backend: decide valid
  property state, ownership, permissions, capacity and ecological consequences.
- GrindZone: show permitted listings/access/history and derive journal/statistics
  from committed game events. It does not authorize trades or expose undiscovered
  animals merely because they affect a listing's perceived value.

Shared infrastructure does not mean one shared balance, one universal currency,
one market, automatic cross-game asset portability or merged product authority.
Game, realm and ranch-instance identities must remain explicit.

## Stable world identity for Blender authoring

The future sale concerns a runtime PROPERTY INSTANCE, not ownership of the mesh
file or the common map template. Many players may eventually use the same authored
terrain template while owning different persistent reserve instances. That decision
must not be accidentally encoded as a sale of the common template itself.

Proposed authored metadata:

- world_template_id and template_revision: geometry/design identity.
- district_id / optional parcel_id: stable identifiers for management/access areas.
- facility_id and access_route_id: lodge, cabin, gate, dock, bridge and road identity.
- units, coordinate convention, bounds and export revision: preserve placement.

Runtime-assigned identity must remain separate: game_id, realm_id,
ranch_instance_id, owner_account_id, state_revision, lease_id and operation_id.
Do not bake an account owner, purchase receipt or monetary value into a .blend
and then treat that editable file as proof of ownership.

Author terrain, vegetation, water, roads, facilities and non-rendering management
boundaries as separate named collections/objects. Reserve editable area geometry
for later access rules. Ownership/lease boundaries are not automatically physical
fences and must not prevent wildlife movement. Mesh streaming tiles are not deeds;
changing render subdivisions must not create new saleable property identities.
No Blender IDs, metadata, boundaries or export pipeline are implemented by this
note. They are requirements for the pending actual Blender artifact.

## Integrity requirements to retain when implementation begins

1. A property can have only the authorized owner/control arrangement at a committed
   revision. Two concurrent buyers cannot both purchase the same exclusive title.
2. Sale and lease operations must revalidate owner authority, listing revision,
   terms and existing obligations. An offline or stale screenshot is not authority.
3. Ownership transition and the selected settlement obligation must have a
   recoverable, idempotent protocol. A retry must not create a second debit, credit,
   deed or lease; failure must not leave an unexplained split state.
4. An active lease cannot disappear silently when a ranch sells. The eventual
   contract must define transfer, cancellation, refund and dispute behavior.
5. Overlapping NPC and player access must use compatible capacity rules. Exclusive
   areas and already-promised harvest allowances cannot be oversold.
6. A lease grants allowed activities, not a guaranteed kill. Animals continue to
   age, breed, move and die. No target immunity or replacement animals to fulfill
   a booking. A buyer's activity can leave persistent ecological consequences.
7. A lease must declare its clock: simulation calendar, wall clock or another
   explicit schedule. Owner fast-forward, pauses and disconnects cannot silently
   consume a paying guest's opportunity outside accepted terms.
8. Selling, backing up or restoring a save must not create two marketable copies
   of the same ranch. Offline single-player ownership remains a design goal;
   marketplace-grade provenance requires a separate explicit trust design. A hash
   or signature of a user-edited save alone does not establish honest gameplay.
9. Listings distinguish observed, estimated, stale and unknown wildlife information.
   No fabricated population certainty or hidden exposure of player-private data.
10. Property history may follow the property under defined terms. Private notes,
    photographs, personal statistics and identifiers do not transfer automatically.

Acceptance examples, NOT tests executed in this revision: simultaneous buyers;
replayed transfer after reconnect; sale with active leases; duplicate save/restore;
lease area/time/harvest violation; target death before a booking; NPC/player capacity
competition; owner fast-forward; cross-game/realm identity confusion; buyer access
revoked after expiry without changing the animal population.

## Deliberately unresolved

Currency/value model: game-earned currency, purchased currency, real-money sales
or another model are not selected. No fiat, deposits, payouts, cash-out, blockchain,
royalties, platform fee, token, provider, subscription, global market or commercial
rights are approved by this idea. No new market is activated even in virtual
currency. Resolve product/platform obligations before any valuable exchange launch;
this note provides no legal or payment-provider acceptance claim.

Also unresolved: shared server versus per-ranch hosting; visit/session ownership;
who can list; whether parcel sales exist; which improvements transfer; lease
exclusivity, duration, remedies and clock; moderation/recovery; game-specific
tradeable categories; compatibility with offline progress; selected shared engine
module(s) and tested release pins. Do not force premature decisions during Blender
world creation.

## SI/Infinity continuation checkpoint

This revision records intent, source ownership evidence, proposed boundaries and
open questions only. It does not implement or integrate a marketplace, change
Frontline, modify SI/Infinity, enable payments, deploy a service, or produce a
Blender world. Existing mortality tests were not rerun for this documentation-only
change and their earlier evidence must not be relabeled as commerce validation.

NEXT EXACT ACTION: create and verify the actual editable Blender world, preserving
stable authored area/facility identities and separate runtime property identity.
Keep the native game and built-in GrindZone goal intact. A concept image is not a
.blend deliverable and a published note is not engine integration.

BEFORE LATER COMMERCE CODE: resolve the existing Frontline/shared capability owner;
record source revision, consumers, compatibility and test status; adapt rather
than clone; mark any missing capability as a gap rather than claiming it exists.
Use Infinity's current catalog/adapter mechanism when verified, not a duplicate
catalog invented inside this game. Retain game-specific ownership authority.

DO NOT REPEAT: a broad audit of unrelated products; discovery already established
above without evidence of change; the earlier fixed-acreage proposal as an owner
requirement; marketplace implementation ahead of the Blender-first instruction;
match-reset logic as ecological persistence; payment activation from brainstorming.
