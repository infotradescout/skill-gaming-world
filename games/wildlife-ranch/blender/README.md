# Blender world — sourced environment and current native scene

**Resume from [NATIVE_CHECKPOINT.md](NATIVE_CHECKPOINT.md).** The owner rejected
the former lodge/forest screenshot. Current work replaces the asset/material
approach and improves scene composition; final COTW-quality acceptance remains OPEN.

Preview: https://wildlife-reserve-world-preview.onrender.com

The page compares the current candidate with the rejected 02 scene from the same
camera and lens. It does not load the formerly unresponsive heavy GLB viewer.

## Current files

- `/art03/Wildlife_Lodge_Shore_03.blend`: editable district, image textures packed,
  approximately 170 MB. Actual revision is `0.3.1-forest-composition`.
- `/Wildlife_Environment_03.zip`: approximately 176 MB, current district, four
  native images, asset provenance and art scripts. Not the entire repository.
- `/art03/approach_eye.png`, `shore_eye.png`, `porch_eye.png`,
  `district_overview.png`: 1280x720 native Blender Cycles renders.
- `/art03/art_receipt.json`: source identity, camera/reopen checks and hashes.
- `/art03/asset_registry.json`: third-party asset attribution and fingerprints.
- `/acceptance03/browser.json`: exact-candidate image/control checks.

Executed native source: `96142043ac0117f98fc09027ff3401fbee9b783a`.
Render deploy `dep-dao8c4h42hec738rnj5g` confirmed LIVE at
2026-09-21T01:30:46.708215Z. Blender 4.5.3 LTS saved and reopened the scene,
verified unchanged cameras and packed images, and generated all four native views.
These execution checks are not proof of final visual quality or playable gameplay.

## What changed

Original project-authored lodge/layout/cameras are retained. Placeholder vegetation
and stones were replaced by Poly Haven pine, grass, fern, mossy-rock and deadwood
assets, with forest-floor/leafy-ground/gravel image materials. The first replacement
was still too sparse; the current pass adds overlapping canopy, forest-edge layers,
more continuous ground cover, soil tone adjustment and less arbitrary stone scatter.
Environment assets are CC0 from Poly Haven, not all project-original geometry.
Source metadata, credits and packed textures are retained; no COTW assets are used.

## Authoring and proof boundaries

Use `build_preview.sh` to reproduce the current pass. `art03_composition.py` reads
the hash-pinned packed 0.3.0 parent preserved at
`/art03_base/Wildlife_Lodge_Shore_03.blend`, then edits and rerenders it. Current
`/art03/` is the 0.3.1 result, not that immutable parent. The current .blend can
also be opened and edited directly. The build shell is served in /source03 but is
not inside the ZIP; required art scripts are included. Full checkpoint has hashes.

All four images, before/after controls, 390px layout and native availability passed
against actual candidate files before publication. The current deployment is live;
post-deploy browser checks from the earlier 0.3.0 pass must not be relabeled as
0.3.1 proof. Coarse thumbnail inspection cannot approve fine material/scale detail.
No interactive 3D responsiveness or game-performance acceptance is claimed.

The approximately 330x330m detailed district is not stitched into the provisional
20x20km macro reserve. The earlier macro .blend and 02 package remain available,
explicitly as earlier layout work. Final map acreage, region and title stay open.

Next: full-resolution art review, authored forest-edge/midstory and ground
transitions, then continuity with the larger terrain. Native first-person gameplay,
wildlife animation/biology, leases, integrated GrindZone, collision, LOD/streaming
and hardware acceptance remain outside this delivered art pass. Preserve the
original game target instead of treating a lodge study as the completed world.
