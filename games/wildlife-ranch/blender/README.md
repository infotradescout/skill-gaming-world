# Blender world — native scenes and Render preview

Current task: build the editable original wildlife-reserve world in Blender first,
with COTW-level quality as the target. Current files are environment-development
art, not a completed game or accepted final visual quality.

**Resume from [NATIVE_CHECKPOINT.md](NATIVE_CHECKPOINT.md).** It records the exact
native build, Render deployment, artifact hashes, failures and next dependencies.
Do not restart a broad repository audit or treat old blockout receipts as current.

## Open the current build

Preview: https://wildlife-reserve-world-preview.onrender.com

- `Wildlife_Blender_World_02.zip`: native scenes, images, GLB and authoring source.
- `district/Wildlife_Lodge_Shore_02.blend`: refined, editable lodge/shore district.
- `macro/Wildlife_Reserve_World_01.blend`: separate full-reserve layout.
- `district/approach_eye.png`, `shore_eye.png`, `porch_eye.png`,
  `district_overview.png`: actual native Blender Cycles renders.

Native build source: `d9da1bc6752f3b22c266a1be2b5636995f74f904`.
Blender 4.5.3 LTS executed successfully on Render; the refined district was saved
and reopened, and four 1280x720 images were generated. The macro file was generated
and existence-checked, not independently reopened by that publisher.

Browser inspection is NOT fully accepted. Image loading and 390px layout checks
passed, and the actual GLB loaded, but 3D capture/close timed out in software-rendered
Chromium. The full GLB is approximately 120 MB. Use the native image views to
inspect the scene without loading that model. Hardware performance is unmeasured.

## Scene scope

The 20x20 km macro reserve remains an editable sizing proposal, not approved final
acreage or geography. Its 64 terrain tiles, water, roads, bridge, facilities,
districts and tree proxies establish a layout only.

The 330x330 m lodge/shore art study adds modeled siding, roof seams, porch framing,
glazing, stairs, dock, branching trees, ground vegetation, rocks, deadfall and
procedural materials. The latest correction adds fuller crowns, denser ground
cover, adjusted lighting/materials, west-gable windows and an entry footpath.
It is NOT yet stitched into the macro terrain. Do not present the two scenes as
one continuous finished reserve. No COTW or third-party game assets are included.

## Reproduce the native district

Run in a dedicated Blender 4.5.3 process, never an unsaved artist session:

    blender --background --threads 4 --python build_refined.py -- DISTRICT_OUTPUT

The wrapper checks the existing base author's exact fingerprint and applies the
art refinement before native serialization. Retain build_district.py,
build_refined.py and refine_district.py together. The output remains editable.
The complete publisher is `build_preview.sh`; normal builds always generate the
current native scene instead of silently reusing an earlier art revision.

Authoring template/district/facility IDs are not runtime account ownership or
leases. Non-rendering district boundaries are not physical fences. Frontline,
GrindZone, SI and Infinity remain separate canonical systems; no replacement
commerce or game engine is introduced by this art work.

Next: resolve heavy browser inspection without discarding full native detail;
review the actual eye-level art; develop continuous ground/shore/vegetation detail;
then stitch the district into the reserve. Wildlife animation, gameplay, collision,
LOD, streaming, biological calibration and built-in GrindZone remain unaccepted.
