# Wildlife Reserve — Unreal 5.7 transition

This is the native project source and import tooling for the existing Blender
0.3.1 district. It is NOT a compiled game, an Unreal import receipt, or a claim
of COTW-level art. The original .blend and existing Render artwork are preserved.

## Current boundary

The Blender-side exporter retains each visible evaluated mesh/Geometry Nodes
placement, deduplicates shared geometry, writes centimeter FBX meshes and packed
texture bytes, and records material and collision policies. Its checksum and
numeric-bounds tests are transport tests, not Unreal acceptance.

The native source contains a first-person character, keyboard/controller bindings,
a field camera, walking/sprinting/jumping, and spatially grouped shared-mesh actors.
The UE editor script creates textured materials where direct source channels are
supported, imports meshes, validates their bounds, assigns collision, recreates
placements, and saves a dedicated map. Complex Blender shader graphs are listed
as requiring native reconstruction; approximate import materials are not visual
parity. The native scene remains authoritative art source.

## Engine alignment and reuse

5.7 matches Frontline's inspected `.uproject`, blob
`f01705d1813ee32ebf406d3b348974da7986cbde`, at Frontline commit
`dab4aa319e1dfa057b225c2e973278e732cb70fa`.
The controller-focus behavior is adapted from its PostLogin implementation
(blob `10cc1d741279ba11a960055f8d26741c46ff359c`). Frontline's pawn references
an external Blueprint; that binary was NOT cloned or claimed integrated.
Match timers, spawning replacement bots, winner logic and map reloads are NOT
inherited. This is a thin game-specific runtime, not a replacement common engine.
Frontline, SI, Infinity and the existing GrindZone companion remain untouched.

## Non-DC build entry point

On an authorized Windows UE5.7 builder with its normal C++ toolchain:

    powershell -File Build-Windows.ps1 -EngineRoot 'C:\Program Files\Epic Games\UE_5.7' -Package

Use the generated handoff ZIP, which includes WildlifeReserve/InputBundle. The
GitHub source alone intentionally contains no large scene binary. The script
compiles the editor module, executes the importer, validates its source-bound
receipt, and then runs Windows cook/package. It does not install an engine,
accept licensing, or require Desktop Commander. Receipts are emitted only for
stages actually run. An executable is not itself proof of an acceptable walkthrough.

The resulting .uproject opens in Unreal; the map is created by the importer.
WASD/mouse or gamepad move/look; Shift sprints and Space jumps. Interior access,
water interaction, wildlife, game-save persistence and the built-in GrindZone
journal are not added by this transport slice. Existing ecology tests stay intact.

## Next acceptance, not a substitute screenshot

Compile/import in UE5.7; inspect source-bound scale, normals, materials and
collision; walk lodge -> path -> shoreline -> dock; record frame times and
unobstructed player movement from a packaged Windows build. Reconstruct flagged
materials in Unreal before making any art-parity claim. The larger reserve is
still separate. No marketplace, payment, population reset or new hosted service
is part of this transition.

## API references used

Epic UE5.7 AssetImportTask, FbxStaticMeshImportData, Transform and CollisionTraceFlag
Python documentation; Blender dependency-graph object-instance API. Imported
FBX's coordinate-system conversion is a hard gate: an unexpected engine result
fails instead of being hidden by scaling the actor. FBX remains right-handed
Z-up, centimeters; the expected Unreal geometry is X,-Y,Z. Instance transforms
use the same reflected basis. Unreal execution remains required to confirm this.

Poly Haven environment asset provenance remains in the existing native package.
No engine, third-party font file, proprietary COTW asset or account data is bundled.
