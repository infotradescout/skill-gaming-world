# Unreal 5.7 transition — exact continuation

## Owner outcome

Continue the original COTW-quality hunting/reserve game in Unreal now. Blender
remains the asset authoring tool, not a prerequisite to finish the full map first.
The owner explicitly requires **no Desktop Commander**. Preserve the existing
Frontline/SI/Infinity reuse boundaries, integrated GrindZone target, permanent
wildlife/reproduction, WMA-scale reserve and exploratory ranch/lease commerce.
No commerce, ecology or standalone companion work replaces this native transition.

## Actual current source and delivery

Executed export/source revision: `4a056f345b5b1c2b8c25a1e4f166dc79956f3c3c`.
Branch: `feature/wildlife-ranch-realism-core-20260920`, draft PR #43.
Render workspace: `tea-d191jph5pdvs73drglkg`, already owner-confirmed.
Existing static service: `srv-dao6d43tqb8s73e36rk0`, auto-deploy OFF.
Deploy: `dep-daoa0c142hec7391egc0`, confirmed LIVE.
Started 2026-09-21T03:10:40.296999Z; finished 2026-09-21T03:12:32.808843Z.

Preview: https://wildlife-reserve-world-preview.onrender.com
Source/import kit: /Wildlife_Unreal_57_Transition_01.zip
Status: /unreal01/status.json
Transport receipt: /unreal01/transport_receipt.json

Package bytes: 199854283.
Package SHA-256: b4eb2495a9fedb375c76f6b04147771aed73bd3b0f89b55d19a1ffe233cd7fff.

The package includes the .uproject, C++ source, configuration, Windows build script,
Unreal editor importer, shared FBX assets, instance placements, image textures,
transport checks and retained Poly Haven provenance. It contains NO Unreal Engine,
compiled .exe, imported .umap, third-party standalone font or user/account data.
The map is generated only when the editor importer actually executes.

The original packed Blender scene is unchanged:
/art03/Wildlife_Lodge_Shore_03.blend, 170287752 bytes,
SHA-256 6fdfe8d118d4ec8f9f009e397d771eea56bdf50986af99c3a6889405e16314e1.
Its art revision remains 0.3.1-forest-composition and visually unaccepted. Native
images, immutable parent, earlier 02 package and macro scene were preserved, not
rerendered. A code/export advance is not a new art-quality claim.

## What executed

On the existing Render Linux builder, Blender 4.5.3 LTS opened the pinned native
scene with automatic script execution disabled. It captured 71,074 supported
visible mesh placements, including Geometry Nodes grass and ferns; produced 113
shared FBX geometry assets; retained 24 material records and 45 packed texture
images; and reconciled counts and file hashes. The FBX parser reopened each mesh
payload to verify numeric centimeter bounds. The original .blend hash was checked
again after export and remained unchanged. No native art rendering was run.

Seventeen dependency-free Python transport tests passed locally and on the builder.
They cover finite values, path/hash validation, duplicate placement/asset rejection,
instance accounting, material references, rotation/scale validity and coordinate
reflection math. They do not compile C++ or exercise Unreal. FBX-side numeric
bounds checks are not proof that UE applies the intended coordinate conversion.

The final exported mesh identity includes per-face material assignments as well
as topology, material slots and UV layers. The publisher replaces only its owned
Unreal-download section when rerun, keeping the previous art UI and links.

Render subsequently marked the exact export candidate live. This turn's direct
web fetch of the public status/page was unavailable; no new post-deploy browser
or complete end-user download validation is claimed from that failed fetch.

## What was implemented in source, not yet executed in Unreal

AReserveWalker: first-person camera, walking, sprinting, jumping and keyboard/
gamepad bindings. AReserveController: local movement/look focus. AReserveGameMode:
independent persistent-world mode with no round timer, replacement bot creation,
winner loop or map restart. AReserveInstanceGroup: shared static-mesh placement
component; the importer groups placements by mesh and 32m cells rather than
creating an Actor for every grass blade.

The Unreal Python importer validates transport hashes, imports direct texture
channels, records unsupported shader graphs, imports static meshes, requires
engine-reported bounds to match, assigns transitional collision, reconstructs
placements, creates a player start and basic lighting, and saves LodgeDistrict.
It refuses to overwrite an unowned/different existing map. Its execution receipt
is written only after the actual engine import completes.

Build-Windows.ps1 validates an existing UE5.7 installation, builds the editor
module, executes the importer, checks its source-bound receipt, and optionally
runs Windows build/cook/package. The script does not install or license an engine,
modify a user's machine settings, require DC or fabricate native test results.

## Exact Frontline reuse and native execution boundary

Frontline .uproject at dab4aa319e1dfa057b225c2e973278e732cb70fa declares UE5.7;
its blob is f01705d1813ee32ebf406d3b348974da7986cbde. The native target is aligned
to that inspected version, not an assumed latest engine. Input-focus behavior is
adapted from FrontlineBRGameMode.cpp PostLogin, blob
10cc1d741279ba11a960055f8d26741c46ff359c. The referenced Frontline Blueprint pawn
binary was not copied or claimed integrated. BR reset behavior is not inherited.

No accessible authorized Unreal 5.7 Windows compiler/runner was established through
the non-DC tools in this turn. The current local container has no Unreal editor;
the available GitHub connector exposes no runner-inventory action, and the checked
Frontline revision has no .github/workflows directory. Those observations do not
establish that the user's existing Unreal installation or another runner is absent.
Do not claim native engine execution merely because the Render exporter ran.

Unreal C++ compilation: NOT RUN.
Unreal editor asset import: NOT RUN.
Windows executable packaging: NOT RUN.
Player-controlled walkthrough/collision/performance: NOT RUN.
COTW-quality art acceptance: OPEN.

## Remaining material and world limits

21 of the 24 material records carry reconstruction/review warnings. Direct texture
channels can be mapped by the importer, but mixed/procedural Blender node graphs,
normal/bump combinations, transmission and water cannot be called visually equivalent
from this exporter. Constant fallback materials are explicitly provisional. The
native material review must not accept a regression to flat placeholder-looking art.

Per-mesh complex-static collision and short trunk-only hulls are provisional walk-
test policies, not optimized shipping collision. Terrain clearance, stairs, dock,
water behavior, collision ordering, FBX orientation, normals, LOD/streaming, shadows
and real hardware performance require actual Unreal testing. The source district
remains separate from the 20km macro layout. No wildlife/game-save/GrindZone runtime
or population/lease transfer is implemented by this art-to-engine transport.

## Resume, failure history and retry safety

NEXT EXACT ACTION: use an already authorized, non-DC UE5.7 Windows build environment
to run Build-Windows.ps1 -Package against this kit. Resolve real compile/import
failures first. Verify the imported scale, materials and collision, then perform
and capture lodge -> trail -> shoreline -> dock in the packaged game. Retain the
exact import/package receipts. Do not stop at another Python suite or source ZIP
and call it the requested runnable game.

Initial export at d3ddf9e failed because Blender 4.5 exposes parse_fbx, not parse,
under io_scene_fbx. It was repaired in 8029677. The 5d6299f export passed before
per-face deduplication and repeat-publication handling were strengthened; the
latest executed 4a056f3 supersedes its kit. Do not repeat the resolved parser audit.

Current build entrypoint blender/build_preview.sh delegates to
unreal/Tools/build_handoff.sh. It uses the exact cached, hash-checked existing art
and does not start another art render. Documentation-only checkpoints do not need
a new deploy. Auto-deploy is OFF; one explicit trigger per real candidate is enough.
No new service was provisioned. Production Skill Gaming World, Frontline,
standalone GrindZone, SI, Infinity, payments and game saves remain untouched.
