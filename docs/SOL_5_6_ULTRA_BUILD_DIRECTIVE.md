# Sol 5.6 Ultra — SGW Robot Combat Foundation Build Directive

## Authority and scope

Work only in the `infotradescout/skill-gaming-world` repository.

Thomas has approved a new original game concept inside Skill Gaming World:

- working title: **SGW Robot Combat**;
- first side: **Free**;
- Blender scripts generate the arena, robots, part library, and exports;
- Godot will run physics, controls, construction, browser/desktop clients, and online matches;
- first asset deliverable: one arena, three basic robots, and a modular construction foundation;
- long-term player promise: players can freely combine approved parts to create original robots and fight each other online;
- no use of “BattleBots” as the public name, logo, affiliation, metadata, store keyword, domain, or protected visual identity;
- no Legal Play, paid entry, wager, cash prize, redeemable value, purchased performance advantage, or money operation.

Do not modify Monetaire rules, Monetaire card appearance work, legal holds, ledgers, or unrelated games as part of this task.

Do not use GitHub Actions. Run and record local checks only. Do not merge or deploy without Thomas’s explicit order.

## Inputs

Use these package files as the implementation basis:

- `blender/sgw_robot_combat_arena.py`;
- `docs/GAME_FOUNDATION_SPEC.md`;
- `docs/NEXT_RUNTIME_BUILD.md`.

Do not replace the supplied generator with a smaller mockup. Correct only proven defects or repository integration conflicts.

## Phase 0 — Establish existing state

Before writing:

1. Record current branch, exact commit, and clean or dirty worktree.
2. Read the complete repository structure and current two-side architecture work.
3. Locate the canonical game-title catalog, Free navigation, feature gates, public route patterns, asset handling, tests, and deployment structure.
4. Record every open local change and do not overwrite unrelated work.
5. Confirm whether Blender 5.2 LTS and Godot 4.7.1 stable are available locally.
6. Create a dedicated branch named `feature/sgw-robot-combat-foundation-20260807` unless that name already exists; if it exists, use a truthful non-conflicting suffix.

## Phase 1 — Add the Blender asset generator

Place the generator in a clear repository tool location such as:

`tools/blender/robot-combat/sgw_robot_combat_arena.py`

Preserve its self-contained behavior. It must not depend on paid models, external textures, marketplace assets, or unsafe automatic script downloads.

Add a repository command or simple documented launcher that:

- locates Blender 5.2 LTS;
- runs the generator in background mode;
- sends output to a repository-ignored generated folder;
- preserves the source `.blend`, GLB files, JSON manifest, and preview;
- returns a nonzero exit code on failure;
- does not silently treat missing Blender as success.

## Phase 2 — Run and verify the generator

Run the script with Blender 5.2 LTS.

Required generated proof:

- `SGW_Robot_Combat_Arena_v0_1.blend`;
- `sgw_robot_combat_arena.glb`;
- `bot_rammer.glb`;
- `bot_ripper.glb`;
- `bot_maul.glb`;
- `sgw_robot_part_library.glb`;
- `sgw_robot_combat_full_scene.glb`;
- `sgw_robot_combat_manifest.json`;
- `SGW_Robot_Combat_Arena_Preview.png`.

Inspect the actual Blender scene and rendered preview. Do not claim quality from file existence alone.

Verify:

- arena dimensions and enclosure;
- three distinct spawn zones;
- all three robots visible and correctly placed;
- no robot below the floor or outside the safety wall;
- Rammer has a wedge and no fake active weapon;
- Ripper has a guarded vertical spinner;
- Maul has an overhead hammer;
- part-library objects and attachment sockets exist;
- custom properties survive GLB export as extras;
- output paths are deterministic;
- repeated generation does not create `.001` duplicate names;
- all generated files open or parse successfully.

## Phase 3 — Add the game title honestly

Add SGW Robot Combat to the canonical game-title model as a title inside Skill Gaming World, not as a platform mode.

Initial state must be one of the repository’s truthful held or development states. Do not present it as playable, live, production-ready, online, or coming on a date unless those statements are directly proven and approved.

The public or authenticated development surface may show:

- original working title;
- Free side;
- robot construction and combat description;
- generated preview only after visual review;
- development status;
- no clickable match operation until the runtime exists.

Do not expose internal file paths to players.

## Phase 4 — Preserve Free and Legal Play boundaries

The title’s initial offering tuple is:

- side: `FREE`;
- category: `SKILL`;
- value class: `NO_VALUE`;
- legal offering class: `NOT_APPLICABLE`;
- operations: development information only until runtime proof exists.

Add tests proving that adding the title does not release:

- valuable-prize entry;
- paid skill entry;
- prize award;
- prize payout;
- Play Coin purchase;
- Play Coin redemption;
- casino deposit;
- casino wager;
- casino settlement;
- casino withdrawal;
- any other Legal Play operation.

## Phase 5 — Repository checks

Run all relevant checks locally. Do not invoke GitHub Actions.

At minimum:

- repository type or compile check;
- focused title-catalog tests;
- focused Free/Legal boundary tests;
- generated-manifest validator;
- any repository formatting or lint command that is already part of the normal local gate;
- production build if the current repository can run it without external blockers;
- browser check of any added development surface;
- accessibility check for any added public card or page.

Do not repair unrelated failures unless they directly block this isolated work. Record them honestly.

## Absolute prohibitions

- Do not rename the game to BattleBots.
- Do not use real BattleBots logos, arena geometry, robot names, likenesses, graphics, or implied affiliation.
- Do not invent a final public brand name.
- Do not activate Legal Play.
- Do not add money, prizes, purchases, wagers, payouts, or redeemable units.
- Do not add uploaded executable player scripts.
- Do not trust client-provided mass, power, collision, force, damage, or result values.
- Do not claim the online game exists merely because the Blender asset generator exists.
- Do not merge or deploy.

## Completion report

Return:

1. exact branch;
2. base and head commits;
3. clean-worktree proof;
4. complete changed-file list;
5. Blender version used;
6. exact generator command and exit result;
7. generated-file list with sizes and hashes;
8. scene inspection findings;
9. preview path and screenshots;
10. GLB import and extras proof;
11. title-catalog integration proof;
12. Free/Legal boundary test proof;
13. all local check results;
14. unrelated blockers;
15. pull-request status;
16. deployment status;
17. exact remaining work before the first playable vertical slice.

Use only: `PASS`, `FAIL`, `BLOCKED`, `NOT IMPLEMENTED`, `HELD`, or `UNVERIFIED`.
