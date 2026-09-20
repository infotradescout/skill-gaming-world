# Native Blender world / Render continuation

Owner outcome: build the original COTW-quality wildlife-reserve world in Blender
first. Built-in GrindZone, persistent ecology and future compatible player ranch/
lease sales remain the game target. This art work does not implement those runtimes.

## Latest actual delivery

Native art source: `d9da1bc6752f3b22c266a1be2b5636995f74f904`.
Branch: `feature/wildlife-ranch-realism-core-20260920`; draft PR 43.
Render deploy: `dep-dao6nmh42hec738lqh40`, confirmed LIVE; finished
2026-09-20T23:36:35.685497Z.

Preview: https://wildlife-reserve-world-preview.onrender.com
Package: /Wildlife_Blender_World_02.zip
Native district: /district/Wildlife_Lodge_Shore_02.blend
Native full-reserve layout: /macro/Wildlife_Reserve_World_01.blend
Native views: /district/approach_eye.png, shore_eye.png, porch_eye.png,
district_overview.png.

Blender 4.5.3 LTS actually executed on the isolated Render builder. The current
native district was saved, rendered from four 1280x720 cameras, exported to GLB,
saved again and reopened. Identity, units, object count and required meshes were
checked after reopening. The macro .blend was generated and existence-checked;
it was NOT separately reopened by this publisher. Do not claim otherwise.

District receipt: /district/district_receipt.json
- revision: 0.2.1-native-art-refinement
- native_reopen_verified: true
- objects: 2838; mesh datablocks: 891
- native .blend: 69623697 bytes
- .blend SHA-256: 6f282ac04ae9282596eaa855cc2606f2e6bd559af609d7d67078c8e3009901f7
- full GLB: 120489076 bytes
- GLB SHA-256: c56e6703583b930627ae787cd6041fdc84ae0d1e71f2d320cf5a1e037272a4b1
- native approach PNG SHA-256: 3852b5b69db3d49fd5e1a6bac18c5c60775446bc398cdff07c5868aa79f5885b
- package: 143763180 bytes
- package SHA-256: d8474a7a6782d89789a41730c7349ea8d3d661a185d088562b0fac607b38d2da

These are generated native scene artifacts, not AI images, VTK substitutes or a
claim that the requested final visual quality has been reached.

## Visual correction and actual acceptance limits

The first native pass at 9f92ad7f5aaa5946827e61f9137d63f74af8d4e7 was generated,
reopened and published. Its actual approach image was inspected and rejected for
sparse tree crowns and washed-out ground; successful execution was not accepted
as successful art direction.

The current pass retains the camera and existing lodge geometry, adds full-crown
foliage and dense grass, separates sky illumination from the directional sun,
changes soil/stone/timber shading, adds west-facing window openings and connects
the entry path to the lodge. Four new native views exist. Final human-scale art
acceptance remains OPEN, not passed by these implementation or render counts.

Current Chromium receipt: /acceptance/browser_acceptance.json.
Scope: actual built candidate artifacts served by an ephemeral loopback server
inside the builder before publication, NOT a fresh live-CDN or game-performance test.
Passed parts: HTML 200; all four native images decoded; 390px viewport had no
horizontal overflow; the actual 120 MB GLB loaded; reset-camera action applied.
Overall passed=false: software-rendered 3D screenshot timed out at 20 seconds and
close-button action timed out at 30 seconds. A loaded GLB is not sufficient evidence
of a responsive interactive viewer. Physical Android/PC GPU performance was not
measured. Do not relabel this as full browser acceptance. Native image viewing and
native downloadable artifacts remain available; the full GLB is heavy.

Earlier hosted inspection at b17871ee229c0f13f42870b76e754a13198f9b04 also failed
its 3D screenshot after confirming image loading and a smaller GLB load. Retain
this failure history; the newer failure is not solved merely by changing a test.

## Owning source and reproducibility

`build_district.py` is the existing base author, SHA-256
0387a37276704095888e6b6a838500ca96cb60c4e2e4821b652ace9229ab6b74.
`refine_district.py` supplies the art correction. `build_refined.py` applies it at
a checked pre-save hook and refuses an unreviewed change to the base source.
Run in a dedicated Blender process, not an artist's unsaved session:

    blender --background --threads 4 --python build_refined.py -- DISTRICT_OUTPUT

`build_preview.sh` creates native scenes, images, GLB, source package and browser
inspection artifacts. Blender binaries are verified against the vendor SHA-256
manifest and are NOT included in the published site. Procedural geometry is original.
Google model-viewer 4.1.0 supplies optional browser inspection; its Apache-2.0
license and notice are included in /vendor/.

The old fixed-artifact reuse mode is retired from the normal publisher. Historical
`inspect_published.py` is pinned to the first native pass and must not be used to
present old art as a new source build. Changes only to documentation must not cause
unchanged native scenes to be rerendered as a substitute for useful work.

## External state and retry safety

Confirmed workspace: tea-d191jph5pdvs73drglkg, My Workspace.
Static preview service: srv-dao6d43tqb8s73e36rk0. Auto-deploy is OFF.
An environment update starts a Render deploy itself; do not trigger a second one.
WILDLIFE_INSPECT_PUBLISHED is 0 and ignored by the new normal build path.
The site uses workspace build/bandwidth resources; no extra paid runtime compute
service was created. The existing production Skill Gaming World service,
Frontline, standalone GrindZone, SI, Infinity, payments and game saves are unchanged.

## Remaining substantive work / resume here

The 20x20 km macro reserve is a provisional layout, not approved final acreage or
finished scenery. The 330x330 m detailed district remains a separate replacement
study: it is NOT stitched into the macro heightfield. Two native files are not
one continuous completed world. Do not shrink the full-game target to this district.

Next browser dependency: make an optimized inspection representation from the
existing native scene, preserve the full-detail .blend, verify that opening,
resetting and closing the viewer remain responsive, and inspect actual rendered
geometry. Reuse the exact current native files and hashes for browser-only work
rather than rerendering four unchanged art views. Do not waive the timeout.

Next art dependency: review all native eye-level views and develop a continuous
lodge -> trail -> shoreline with credible vegetation, banks, ground materials and
exterior detail; then merge the area spatially into the larger reserve while
preserving authored district/facility identities. Botanical fidelity, production
materials, collision, LOD, streaming and hardware performance remain unaccepted.
Native hunting, wildlife AI, reproduction, leasing and embedded GrindZone remain
future integration work. Do not start a marketplace, another engine audit, a new
proof service or an unrelated project in place of this continuation.
