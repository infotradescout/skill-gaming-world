# Wildlife Ranch: full-game product contract

Updated: 2026-09-20. Working label only; no final title selected.

## Authoritative owner direction

Build an original first-person, open-world hunting game targeting the complexity,
immersion and production quality of theHunter: Call of the Wild (COTW), with the
owner's GrindZone companion capabilities built into the game. Add persistent,
biologically grounded wildlife populations and reserve-management consequences,
rather than replacement respawns. The game must not become a browser dashboard,
a deer-only management simulator, or a large terrain demo offered as the product.

The inherited-property premise remains. The owner expanded the original
10,000-acre idea to a WMA-like landscape. Acreage and geography are configurable
and unresolved. The assistant's suggested 100,000 acres is a sizing hypothesis,
not an owner-approved final map size. COTW is a quality/complexity benchmark, not
permission to copy its assets, maps, brands, reference tables or internal data.

This document supersedes the earlier fixed-acreage product wording and any
interpretation of "separate from GrindZone" as excluding integrated features.
The original game and the existing multi-game companion remain separate products;
GrindZone capabilities are to be embedded in this game without disrupting the
existing companion's COTW support.

## Non-negotiable experience

| Area | Target experience, not current implementation |
| --- | --- |
| First-person hunting | Responsive movement, optics and equipment handling; tracking, wind and sound awareness; stalking, game ballistics, hit response, blood trails and recovery. The hunt must work as an enjoyable complete activity before management screens can compensate for it. |
| World and atmosphere | Traversable, authored-feeling terrain; coherent vegetation and habitats; convincing water, lighting, day/night transitions, weather and spatial audio. Acreage does not substitute for useful detail or encounter quality. |
| Wildlife presentation | Species-appropriate models, body/age/sex variation and animation; young animals; convincing locomotion, feeding, rest, alertness, escape and interactions. A probability calculation is not an animated behavior. |
| Persistent ecology | Birds, deer, foxes, fish, predators and supporting prey/habitat. Identity, parentage, reproduction, growth, nutrition, mortality and movement persist off-screen. No replacement spawn rule or attachment-based protection. |
| Reserve management | Habitat, water, access, roads, cameras, equipment, districts and hunting pressure have spatial consequences. The surrounding population can exist outside the playable reserve without a hidden replenishment shortcut. |
| In-world business | NPC hunt leases concern actual dates, areas and eligible existing wildlife. Hunters can succeed or fail; booking does not freeze a target's life. Prices and revenue are fictional game-economy values, not real payments. |
| Built-in GrindZone | An integrated map/field journal, observations, herd and individual histories, hunt sessions/rotations, equipment, career and weapon statistics, trophies, references and sharing. Automatic capture is the default; notes are optional. |
| Finished-product quality | Coherent visual direction, animal and environmental audio, animation transitions, readable controls, controller/keyboard accessibility, reliable saves and measured performance. Passing headless tests does not meet this standard. |

All of these are target requirements. They are not a claim of feature parity,
empirical calibration, current multiplayer/console support or delivered gameplay.

## GrindZone integration contract

### Native events, not another save scanner

The original game controls its own authoritative simulation and player actions.
Its runtime should publish versioned, committed events directly to an embedded
GrindZone projection. No manual import, game-file reverse engineering, separate
launcher, browser tab, Node process or Desktop Commander is to be required for
normal integrated use. An optional phone/second-screen view is additive, not the
only way to use the companion.

The companion reads committed state/events and maintains a derived journal.
It does not write arbitrary changes into game saves. An in-game management
command travels through the game's normal command validation and simulation;
its successful result can then be projected into the journal.

Architectural direction:

    One authoritative game/simulation state
        -> committed, versioned events
        -> player-knowledge projection
        -> embedded GrindZone map, journal and statistics
        -> optional user-authorized export or second screen

Stable reserve/save-lineage, session, animal and event identities must prevent
cross-save merging, duplicate statistics, attribution changes or replaying an
operation after reconnect. Derived projections must be reconstructable without
modifying the source save. Exact native event schema/transport is not implemented
in this revision and must be verified against the actual runtime, not only mocks.

### Preserve semantics; do not inherit respawn-based assumptions

Keep shots fired, hits, misses, wounds, confirmed deaths and recovered/claimed
harvests distinct. Attribute player, NPC, predator and accident outcomes separately.
A population disappearance is not evidence of a player kill. Runtime ground truth
and player knowledge are distinct; confirmed, estimated, stale and unknown values
must be labeled rather than guessed. A default observation-led view is recommended;
any assisted full-state view should be explicit, not accidentally leak hidden data.

Family histories, condition, growth, observed locations, mortality evidence and
management outcomes should augment the existing grind/session tools. Do not port
respawn timers, reset-based stacking or COTW trophy thresholds into this natural
reproduction model. New-game maps, equipment references, trophy/rarity definitions
and biological profiles must belong to this game.

The existing companion's own authored map/journal/statistics/share behavior can
be reused where appropriate; its implementation needs an adapter and may need a
native presentation layer. COTW map imagery, game-derived tables and other
third-party materials are not automatically included or cleared for redistribution.

### Ownership and sharing

Local game progress and companion records remain under the player's control.
Single-player progress must not require cloud connectivity. Photo/stat exports
are deliberate actions; optional sync/sharing is opt-in. The journal must retain
historical animals and decisions after death instead of replacing their records.
Existing GrindZone COTW and future multi-game work remains intact.

## Technical direction: proposal, not an installed engine

Unreal Engine 5 is the recommended native-runtime candidate for evaluation, not
an owner-approved version lock or a claim that it is installed. Epic documents
World Partition for distance-based large-world streaming and MassEntity for
data-oriented processing [UE-WORLD, UE-MASS]. These are implementation tools,
not evidence of a finished wildlife simulation or COTW-quality art/animation.

World streaming controls representation, not existence. Nearby animals can use
detailed navigation and animation; distant animals need lower-cost simulation
while retaining the same identities, life histories and spatial constraints.
Population scale, simulation timing and rendering budgets require measurements.

The existing JavaScript core is a mechanics/reference harness. Preserve its useful
identity, mortality and accounting tests. Do not treat it as a finished game engine,
and do not maintain contradictory JavaScript and native worlds as co-equal
production authorities. Any native port/bridge needs explicit semantic parity and
save migration. The Skill Gaming World website can distribute or describe the game;
it is not a substitute for the first-person game runtime.

## Next delivery: a representative playable district

The next player-facing milestone is a native, playable section that connects the
three defining parts: hunting, ecology/management and GrindZone. Build a smaller
representative district at the intended quality direction before extrapolating
acreage or promising a full species/catalogue count. Do not reduce final wildlife
scope to deer just because the first interaction is developed with one species.

The acceptance scene should include woodland/open ground, water habitat and a
road/access boundary; a persistent herbivore family; a predator; birds and a fish
population at explicitly documented implementation fidelity; and a small set of
usable equipment and management actions. Region-specific calibration continues
alongside the runtime/art work rather than blocking all 3D interaction indefinitely.

Acceptance journeys:

1. Walk, observe, identify, stalk and attempt a hunt in-engine. A successful
   recovery automatically updates the built-in journal once; a miss, wound or
   unrecovered animal does not become a fabricated recovered harvest.
2. Observe the same animal across sessions and streaming boundaries. A genuine
   birth adds recorded offspring; a real death remains permanent. The interface
   only claims what the selected knowledge mode has evidence to show.
3. Make one habitat/access decision and run one NPC lease. Their outcomes alter
   the same world the player inhabits, not a separate business minigame population.
4. Save, exit and reload. Animals, genealogy, journal, lease status and permitted
   companion projections remain consistent; no duplicate rewards or reset animals.

Presentation acceptance requires captured gameplay from a named packaged build,
asset provenance and visual/interaction review against selected COTW reference
scenes. Proposed performance target: 60 FPS on a declared PC hardware/resolution/
quality preset, with frame-time distribution, 1% lows, streaming hitches, memory,
AI population and simulation-update cost reported. Hardware and acceptable budgets
must be fixed before a performance-pass claim; none is established here.

This milestone needs genuine terrain/animal/animation/audio production as well as
code. A still render, generic asset collection or capsule-animal prototype may aid
development, but cannot be labeled final visual acceptance. Cooperative play and
console distribution remain future scope decisions, not current commitments.

## Current evidence and resume point

Inspected game baseline: PR #43, head
`f39f561c3d12bd35a5e6c45edaeac4fa542fb0e9` on
`feature/wildlife-ranch-realism-core-20260920`.
It contains the mortality/encounter reference core and its earlier scoped evidence.
No native project, playable scene, embedded GrindZone runtime, biological calibration
or new test execution is delivered by this product-contract update.

Companion source read: `infotradescout/cotw-field-companion/README.md`, blob
`f2186a279107acfd43dcfd1f1f2220ceeb5a069e` on 2026-09-20. It describes local
read-only saved-data observation, maps, career/harvest distinctions and sharing,
with explicit coverage and third-party-material limits. It does not prove that
those modules have already been integrated into the original game.

Resume from this branch and this product direction. Preserve the existing core;
next implement the native playable hunting-to-GrindZone path, with ecological
calibration and presentation production alongside it. Do not start another broad
project audit, standalone companion service or backend-only replacement milestone.

## Primary-source references

[COTW-OVERVIEW] Avalanche Studios Group, theHunter: Call of the Wild product
page, accessed 2026-09-20:
https://avalanchestudios.com/games/thehunter-call-of-the-wild
The publisher describes animal behavior, dynamic weather, day/night, ballistics,
acoustics, wind-borne scent, equipment and open-world exploration. Its original
area description is not used here as a current per-reserve size specification.

[UE-WORLD] Epic Games, World Partition, accessed 2026-09-20:
https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine

[UE-MASS] Epic Games, MassEntity Overview, accessed 2026-09-20:
https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-mass-entity-in-unreal-engine

[GRINDZONE-SOURCE] Owner companion source read:
https://github.com/infotradescout/cotw-field-companion/blob/main/README.md
Content identity is recorded above; this moving link alone is not an exact-source
runtime acceptance receipt.
