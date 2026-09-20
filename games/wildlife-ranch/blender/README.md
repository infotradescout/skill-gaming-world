# Blender world 01 — original wildlife reserve

Current task: build the editable world in Blender before the native hunting game.
This is a first-pass environment, not COTW-level finished art or a playable game.

The generated .blend contains 64 metric terrain tiles, a lake and river, roads and
shore trail, a bridge, a main lodge, three cabins, a dock, a service shed, an
observation tower, linked procedural tree instances, rock/reed proxies, eight
non-rendering management districts and three saved cameras.

20 x 20 km / 400 km² is an editable sizing proposal (~98,842 acres), NOT owner
approval of a final map size or real geography. This is original fictional
terrain. All geometry/materials are procedural; no COTW or third-party assets.
No wildlife, ecology, automatic companion or transactions are represented as done.

Build in a DEDICATED fresh Blender process (3.6+ compatible API target):

    blender --background --python build_world.py -- --output output
    blender --background --python verify_world.py -- output

The build resets only that Blender process to factory state. Do not execute it
inside an unsaved artist session. Native .blend data, PNG camera renders, little-
endian R16 height data, coordinate metadata, a manifest and receipts go to output/.
The source .blend opens on the overview camera and retains editable collections.

Forest placement points retain scale and rotation attributes plus live Geometry
Nodes instancing. The prototype library is below the terrain to keep original
assets out of the camera views. Its geometry is original, low-detail authoring
proxy art, not final foliage or a calibrated real-world vegetation population.

One height raster supplies all adjacent tile borders. verify_world.py reopens
actual saved .blend data in a NEW Blender process, checks all 112 internal seams,
IDs, metric units, evaluated tree instances, self-contained assets and actual PNG
dimensions/data. Numeric checks alone do not constitute visual acceptance.

The separate authoring IDs are world template, terrain tile, management district,
waterbody, access route and facility. No owner_account_id, money or deed is baked
into the art. Districts are not physical fences. World-instance ownership and
future leases remain separate runtime responsibilities. Frontline and existing
GrindZone/SI/Infinity engines are unchanged; no substitute commerce stack is added.

Re-use/continuity: existing wildlife branch, PR 43. This original terrain script
fills the absent Blender-world artifact rather than changing Frontline's match
reset behavior into persistent ecology. Follow ../PRODUCT_CONTRACT.md and
../FUTURE_PLAYER_COMMERCE.md for the full game and future integration requirements.

Next art pass: inspect all three native renders and actual world navigation;
correct roads/earthworks and human-scale composition; develop one detailed district
with production foliage, shoreline geometry, collision/LOD and original wildlife
art. Preserve the same authoring identities. Native game import, streaming,
walkability, hydrology and final biological calibration have NOT been accepted.
