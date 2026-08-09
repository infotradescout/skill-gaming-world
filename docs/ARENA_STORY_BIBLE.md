# ARENA STORY BIBLE — BAY 13: THE SCRAPYARD

**Status:** Story control document — locked concept  
**Authority:** This bible governs arena architecture, materials, robots, landmarks, entrances, hazards, lighting, camera, and match presentation. Story must appear in geometry, labels, and evidence — not only here.  
**Continuation gates:** Visual / Godot / merge / deploy remain under separate owner statements. This document does not authorize runtime work.

**Sibling docs:** `docs/ENVIRONMENTAL_STORY_LEDGER.md` (per-element purpose + gameplay tags)

---

## Locked identity

| Field | Value |
| --- | --- |
| Working title | **BAY 13: THE SCRAPYARD** |
| Place type | Former coastal shipbreaking yard, converted independent robot-combat arena |
| Combat floor | Former ship-transfer platform |
| Belief | Factory machines are purchased. Scrapyard machines are proven. |
| Platform side | Free-side Skill Gaming World title |
| Language note | **Scrap / Scrapyard** means **fight / brawl** — they come here to scrap. It does **not** mean a dump of worthless junk, trash aesthetics, or junkyard branding. Historical shipbreaking / salvage fabrication language remains accurate for the site’s industrial past. |

**Naming:** Use **Scrapyard** everywhere venue naming appears. Do not use Breakyard, junkyard, dump, or trash-heap framing.

---

## Introductory story (locked intent)

Exact narrative intent (adapt Breakyard → Scrapyard if older copy appears):

> Bay 13 broke ships for forty years. When the contracts died, the builders stayed. They welded a combat floor into the old transfer dock and made one rule: build it yourself, bring it through the gate, and leave with whatever still runs.

---

## History in one page

Bay 13 was a coastal shipbreaking berth where hulls were cut, sections transferred, and salvage steel was fabricated into working gear. When corporate contracts vanished, the company abandoned the site. Welders, mechanics, fabricators, riggers, and equipment operators remained.

They converted the old **ship-transfer platform** into a combat floor, kept the industrial tools that still earned their keep, and opened an independent arena known as **The Scrapyard** — where machines come to scrap, and reputation is earned by what still runs.

Builders bring original machines made from salvaged industrial equipment and fabricated parts. They compete for standing inside the yard. The place is old, repaired, active, and run by skilled working people — not a post-apocalyptic ruin, not a television studio, and not a trash dump.

---

## Story controls everything

This narrative must drive:

1. **Architecture** — transfer-platform floor, ship-hull enclosure, rib supports, service gates  
2. **Materials** — working industrial metals, polycarbonate, salt/oxide wear (controlled, not apocalypse trash)  
3. **Robots** — Yard Mule / Keelcutter / Pilebreaker origins and silhouettes  
4. **Landmarks** — Cutting Hall, Crane Row, Crow’s Nest, Crew Bays, Wall of Wrecks, Exterior Scrapyard  
5. **Entrances** — freight / service gates tied to crew staging  
6. **Hazards** — story foundations only until fairness decision  
7. **Lighting** — warm fabrication vs cold dock storm vs hard match work lights  
8. **Camera** — broadcast readable; landmarks and scale always present  
9. **Match presentation** — ceremony sequence as story markers (animation not required this pass)

All arena assets remain reproducible from `tools/blender/robot-combat/sgw_robot_combat_arena.py`. Story arena comes from the generator — not a disconnected concept render.

---

## Architecture (combat floor & enclosure)

### Combat floor — former ship-transfer platform

The fighting surface is competitively fair and visually readable:

- large steel deck plates  
- radial transfer-rail seams  
- lifting points  
- inspection hatches  
- old repair welds  
- replaceable damaged panels  
- central mechanical bearing ring  
- restrained painted match markings  
- clear but integrated spawn locations  
- tire marks, weapon scars, dents, controlled grime  

**Fairness:** no random debris cover; no junk piles on the floor; story objects sit around, above, or beyond the competitive play volume.

### Enclosure — industrial, not aquarium glass

Replaces thin rail + aquarium-glass look:

- layered ship-hull armor at bot-impact level  
- thick framed polycarbonate above the armor  
- enormous ship-rib structural supports  
- reinforced corners  
- heavy service / freight gates  
- visible repair patches from previous impacts  
- believable fasteners, brackets, welds, supports  
- protected camera and observation positions  

---

## Materials (story-readable)

**Use**

- blackened / competition steel  
- patched ship plate  
- brushed / machined metal  
- dark rubber  
- thick polycarbonate  
- faded safety markings  
- oxide and salt exposure  
- controlled grease / grime  
- wet exterior dock materials  

**Avoid**

- cyberpunk neon  
- random sci-fi tech  
- clean TV studio  
- toy look  
- excessive darkness or overexposed white  
- random clutter  
- abandoned-apocalypse trash dump  
- BattleBots / any proprietary arena copying  
- junkyard-as-trash branding  

---

## Major story locations (landmarks)

| Location | Former purpose | Arena purpose |
| --- | --- | --- |
| **Cutting Hall** | Hull-cutting bay | Warm industrial backdrop; fabrication energy adjacent to the floor |
| **Crane Row** | Overhead lift / recovery | Magnetic recovery crane, chain racks, recovery zones |
| **Crow’s Nest** | Shipyard control room | Match control, score, siren, warning lights |
| **Crew Bays** (×3) | Service / freight stalls | Machine staging, freight gates, crew work |
| **Wall of Wrecks** | Yard culture display (post-conversion) | Damaged fictional components + empty future slots |
| **Exterior Scrapyard** | Coastal shipbreaking berth | Containers, cranes, wet surfaces, dock lights, dark water, vessel skeleton, workshops |

Full per-element records: `docs/ENVIRONMENTAL_STORY_LEDGER.md`.

---

## Entrances

| Entrance | Story role |
| --- | --- |
| **Freight / service gates** (per Crew Bay) | Machines enter for the scrap — “bring it through the gate” |
| **Crew service doors** | Human access to staging; not match combat volume |
| **Observation / camera ports** | Protected viewing; broadcast language, not studio VIP boxes |
| **Exterior dock approach** | Establishing shot: coastal yard → arena interior |

Gates read as heavy industrial freight hardware retained from ship-transfer days, now used for combat staging.

---

## Starter machines (gameplay classes preserved)

| Class | Working identity | Origin language |
| --- | --- | --- |
| **Rammer** | **Yard Mule** | Yard tractors, forklifts, harbor tug equipment |
| **Ripper** | **Keelcutter** | Ship-hull cutting equipment |
| **Maul** | **Pilebreaker** | Dock pile-driving / heavy forging equipment |

Identification uses restrained crew panels, stripes, numbers, and repair markings over industrial metal — not large clean primary-color boxes. Designs are original; do not imitate protected television robots.

---

## Match ceremony (story markers)

Ceremony is a **story sequence of named markers / pivots**. Runtime animation is not required for story blockout; markers define presentation intent.

1. Work lights activate over crew bays  
2. Three freight gates open  
3. Bots enter the arena  
4. Dock bell sounds  
5. Safety shutters close  
6. Crane lights sweep the floor  
7. Main shipyard siren begins countdown  
8. Match starts  
9. Major impacts → controlled sparks / environmental reactions (**later**)  
10. Knockout → red recovery lights + recovery-crane sequence (**later**)

---

## Hazards (foundations; fairness-gated)

| Hazard | Tag | Note |
| --- | --- | --- |
| Hydraulic hull-straightening ram | `interactive later` | Geometry / marker only until fairness decision |
| Recessed chain-drag channel | `interactive later` | Geometry / marker only until fairness decision |
| Magnetic recovery zone | `interactive later` | Story + recovery presentation; combat hazard mode held |
| Short cutting-torch vents | `visual only` | Atmosphere from Cutting Hall adjacency |
| Reinforced corner impact pockets | `active now` | Static collision armor only — not a special hazard mode |

**Rule:** No hazard becomes an active match mechanic without a separate fairness decision (server state, timing, collision, damage, logging, replay). Inactive bays / markers must stay tagged inactive.

---

## Lighting

| Zone | Intent |
| --- | --- |
| Combat floor | Strong, controlled work lights — readable scrap, not nightclub |
| Cutting Hall | Warm industrial fabrication glow |
| Exterior Scrapyard | Cold storm / dock light; wet reflections |
| Crane Row | Cool practicals + recovery sweep markers |
| Crow’s Nest | Control-room practicals; siren / warning accents (restrained) |
| Wall of Wrecks | Museum-side lighting; respectful display, not horror |

---

## Camera contract

Main broadcast camera must show:

- all three machines complete  
- transfer floor  
- ≥2 major landmarks  
- enclosure scale  
- FG / MG / BG depth  
- clear arena silhouette  
- no overhead structure cutting the focal area  

**Required evidence language:** exterior establishing; arena overview; low floor-level scale; Cutting Hall; Crane Row; Crow’s Nest; Wall of Wrecks; all three crew bays; Yard Mule / Keelcutter / Pilebreaker close-ups; modular parts and attachment points; silhouette tests; camera-composition test.

---

## Fair competitive floor

- Story objects belong **around / above / beyond** the play volume.  
- Floor remains a fair scrap surface — seams and scars are readable, not traps.  
- Spawn clarity and collision honesty beat spectacle.  
- Free-side title only this pass: **no Monetaire, Legal Play, or cash changes**.

---

## Technical continuity

Preserve named collections, modular geometry, robot roots, sockets, pivots, collisions, metadata, manifest, separate GLB exports, complete-scene export, deterministic clean generation.

**Out of scope for docs / story blockout alone:** Godot runtime, final detailing, merge, deployment, BattleBots copying, junkyard trash redesign.

---

## Approval gate (process continuity)

| Gate | Status |
| --- | --- |
| OWNER PREVIEW | Per latest evidence report (not granted by this doc) |
| OWNER STORY BLOCKOUT | Requires exact `OWNER STORY BLOCKOUT: PASS` |
| Godot / merge / deploy | **HELD** until separately authorized |
