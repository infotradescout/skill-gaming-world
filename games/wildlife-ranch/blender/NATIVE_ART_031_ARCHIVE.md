# Native Blender world — current continuation

## Owner outcome and correction

The owner rejected the 0.2.1 lodge/forest screenshot as still far from the requested
COTW-quality world. The immediate task remains actual editable Blender environment
production, not a generated image, a management dashboard or a marketplace.
Preserve the full native hunting/ecology/GrindZone goal and Frontline/SI/Infinity
reuse boundaries. Do not confuse this district's art progress with a finished game.

## Latest actual native delivery

Native build source: `96142043ac0117f98fc09027ff3401fbee9b783a`.
Art revision: `0.3.1-forest-composition`.
Branch: `feature/wildlife-ranch-realism-core-20260920`, draft PR #43.
Render service: `srv-dao6d43tqb8s73e36rk0`.
Confirmed workspace: `tea-d191jph5pdvs73drglkg`, My Workspace.
Deploy: `dep-dao8c4h42hec738rnj5g`, confirmed LIVE.
Started: 2026-09-21T01:19:14.717815Z.
Finished: 2026-09-21T01:30:46.708215Z.

Preview: https://wildlife-reserve-world-preview.onrender.com

| Artifact | Public path | Bytes / SHA-256 |
| --- | --- | --- |
| Packed editable district | /art03/Wildlife_Lodge_Shore_03.blend | 170287752 / 6fdfe8d118d4ec8f9f009e397d771eea56bdf50986af99c3a6889405e16314e1 |
| Approach native PNG | /art03/approach_eye.png | 1946534 / 8272cff29b85b0d95cc1c723d2477736352706a7c7859f600e207414690973ac |
| Shore native PNG | /art03/shore_eye.png | 1847511 / e8ac945c07f0b11816e7921c4122eb2a9e0655e2d63810d8b2a8fad3f6949bc1 |
| Porch native PNG | /art03/porch_eye.png | 1526919 / 60f2f13741c50790440973e66b85d1625487c5212030e1ca94023bfbdec2b570 |
| Overview native PNG | /art03/district_overview.png | 1622806 / 117e7a3b60d0fe00d2852ec1c2219e490db55ad4aca20d5d481019e8bb342d6b |
| Scene/art-source package | /Wildlife_Environment_03.zip | 176181970 / 8aae38179dc6afb3eb1750d10230765fc23bc7062bdae2ce29b10488a00e0697 |

Native receipt: /art03/art_receipt.json.
Asset provenance: /art03/asset_registry.json.
Package receipt: /art03_package.json.
Candidate browser receipt: /acceptance03/browser.json.

Blender 4.5.3 LTS actually ran on the existing Render builder: the packed scene was
saved, four 1280x720 Cycles views were rendered, the file was saved again and reopened.
The script verified the expected revision, terrain presence, used image textures
packed, and unchanged camera transforms/lenses. `native_reopen_verified=true` and
`same_camera_verified=true`. `visual_approval=false` remains deliberate.

## What changed, and what the images do not establish

The original project-authored lodge, terrain layout, water and cameras were retained.
Rejected placeholder trees, blade clumps and faceted rocks were replaced using
Poly Haven native pine, grass, fern, mossy-rock and deadwood assets. The ground and
trail now use image-based diffuse/roughness/normal/displacement materials rather
than flat vertex colours. A subsequent composition pass changes canopy overlap,
forest-edge placement, ground coverage, exposed-soil tone and scattered stones.

The sourced 0.3.0 pass was built first and inspected, but still showed sparse
composition and exposed ground. That observation led to the executed 0.3.1 pass,
not a claim that asset downloads alone satisfied the user. The final approach
was inspected through a 320x180 JPEG diagnostic reconstructed from the actual PNG;
it shows changed canopy and foreground coverage, but is NOT sufficient for
fine-detail, species-scale, material or final-quality approval. Enlarging that
thumbnail does not increase its evidence quality. Full native PNGs remain available.

The canopy still needs species/age variation and authored transitions rather than
reading as repeated tree trunks and a dense crown band. Ground-plant distribution,
plant scale, soil transitions and the lodge surroundings remain art-review work.
No reference-matched COTW visual acceptance has passed. Do not use object counts,
file sizes, successful rendering or these thumbnail checks as substitutes.

## Sources, licensing and exact reuse

Environment models from Poly Haven: pine_tree_01 (static LOD2, three variants),
grass_medium_01 (LOD1), fern_02, rock_moss_set_01 and dead_tree_trunk_02 (LOD0).
Textures: forest_floor, leafy_grass and gravel_road, with 2k image maps.
Official asset license: https://polyhaven.com/license (CC0).
API conditions: https://polyhaven.com/our-api.
The downloader uses a unique User-Agent, attribution, bounded HTTPS downloads,
upstream size/MD5 checks and retained SHA-256 fingerprints. Initial download:
50 files, 712113700 bytes. Their native static collections were actually inspected.
Do not repeat that discovery without evidence of asset changes.

The lodge/layout remains project-authored; the environment assets are THIRD-PARTY
CC0 assets. Do not describe the entire scene as original geometry or imply COTW
asset reuse. Attribution and source metadata are included. Current used image
textures are packed in the delivered .blend. No standalone font files are distributed.
Native source downloads were opened with automatic script execution disabled.

## Proof scope

Current exact-candidate Chromium checks passed before publication: native receipt,
all four decoded images, current/rejected matched-camera switching, 390px viewport
without horizontal overflow, and native-file availability. Those ran against actual
candidate files served by an ephemeral loopback server in the same builder.
They do not establish post-deploy CDN operation, fine visual quality, game performance
or an interactive 3D experience. Render subsequently reported this exact source LIVE.

A separate read-only live browser check DID verify the first sourced 0.3.0 build
at `5529248ebb899ba10ce36e4fa7021f343edcd216`: four live image hashes, comparison
controls, 390px layout, native-file HEAD and source receipt. Do not reuse that as
post-deploy browser proof for the newer 0.3.1 source.

The new page is an image-first before/after inspection surface. The previous heavy
GLB viewer's responsiveness failure is NOT marked repaired; no current interactive
3D or game-performance claim is made. Prior 02 downloads and /macro remain available.

## Active authoring path / immutable inputs

`art03_replace.py` creates the first sourced pass from the exact 02 native file.
`art03_composition.py` is the current correction and opens the exact packed 0.3.0
parent instead of repeating the initial assets download and scene replacement.
Parent 0.3.0 is preserved at:
`/art03_base/Wildlife_Lodge_Shore_03.blend`
SHA-256: `0754f9db70d016be60c7aa5b249036bbc9a110af26722b212dfe3d95644cb7f6`
Bytes: 168970705. It is not the current 0.3.1 download.

Run through `build_preview.sh`, which resolves the required Python module path,
checks inputs, runs the native composition author, preserves that parent, publishes
and runs the candidate browser checks. The saved current .blend itself is directly
editable and does not require rebuilding. Art scripts are in the ZIP; the build
shell is also served under /source03 but was copied there after ZIP creation.
The ZIP does not contain the immutable parent scene or the entire repository.

## External state / retry safety

Auto-deploy is OFF. Documentation-only commits must not trigger another render.
The environment variable WILDLIFE_ART03_LIVE_REVIEW_ONLY remains 1 from an earlier
read-only inspection, but is RETIRED/IGNORED in the current normal publisher.
Do not reset it for cosmetic cleanup: environment updates themselves trigger deploys.
Likewise old WILDLIFE_INSPECT_PUBLISHED is ignored. Use one trigger only when a real
new art change is ready; no additional static or compute service is needed.

Historical read-only review deploy `dep-dao88omgekts73b976s0` reported build_failed
because its script intentionally exited 3 after successful live checks, leaving
published native artifacts unchanged. Initial asset inspection also deliberately
stopped before publication. Earlier KeyError on texture channel names was repaired;
Diffuse/Rough/Displacement aliases are already handled.

Existing production Skill Gaming World, Frontline, standalone GrindZone, SI,
Infinity, payments, player accounts and game saves remain untouched by this work.

## Next exact work; preserve full scope

Review the four FULL-RESOLUTION native views, not just the low-resolution diagnostic.
Continue authored forest-edge/midstory structure and scale-correct ground transitions;
fix remaining artificial repetition before another density-only change. Keep the
same comparison camera, inspect the actual scene, and record remaining failures.
Do not substitute another concept image, platform audit or proof service.

The detailed approximately 330x330m district is STILL SEPARATE from the provisional
20x20km macro terrain. Final acreage and region remain open. The larger reserve is
not complete or continuous. Stitching, collision, streaming/LOD, botanical diversity,
material refinement and hardware performance remain unaccepted. Scaled small trees
are art proxies, not a validated simulation of juveniles.

Wildlife animation, natural reproduction, ecological calibration, NPC/player leases,
first-person hunting and integrated GrindZone are not implemented by this art pass.
Maintain those product requirements without presenting this lodge study as the game.
