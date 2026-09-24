# Unreal 5.7 — local build launcher and actual next boundary

## Owner outcome

Build the original COTW-quality wildlife-reserve game in Unreal, retaining Blender
as its authoring source and built-in GrindZone as the product target. Preserve
persistent wildlife, natural reproduction, WMA-scale management, Frontline/SI/
Infinity reuse and exploratory player ranch/lease commerce. The owner requires
NO DESKTOP COMMANDER. The latest request was to execute the build for them.

## Latest actual work

Published code candidate: `3c9f8809f4d994158aff3bf9e43909f2e243b814`.
Native-import repair: `09eb0718ea899d0ec0dde93875a6073b5a423aa7`.
Branch: `feature/wildlife-ranch-realism-core-20260920`, draft PR #43.
Render workspace: `tea-d191jph5pdvs73drglkg`, already confirmed.
Existing static service: `srv-dao6d43tqb8s73e36rk0`; auto-deploy OFF.
Deployment: `dep-daoac4g473hc739i73l0`, confirmed LIVE,
finished 2026-09-21T03:37:11.660806Z.

The public entry file is /START-WILDLIFE.cmd on
https://wildlife-reserve-world-preview.onrender.com
The existing page links it. It is a readable build launcher, NOT a compiled game.
One launch is required on a Windows PC with an existing authorized UE5.7 engine
and C++ toolchain. The connected tools did not establish a native Windows runner.
No remote-control agent, extra service, engine installation or account change was
introduced. No automated background access to the user's PC is implied.

Exact immutable code/assets kit:
/unreal01/releases/3c9f8809f4d994158aff3bf9e43909f2e243b814/Wildlife_Windows_Build_02.zip
Bytes: 199873805.
SHA-256: 029797c3d2065bcdca67c7a6c7826061d6289588c14efee6c686303a63d6917b.
Launcher bytes: 6626.
Launcher SHA-256: caa0ce7f823e13c53ab5cf4544a01fea29f48aeb8145c084cb7f54617db08ddf.
A local /mnt/data/START-WILDLIFE.cmd was generated and its hash matched the Render
builder's launcher exactly; that is not a post-deploy download or Windows run.
Public receipt: /unreal01/windows-entry.json.

## Implementation

Start-Wildlife.ps1.in is the canonical plain-text launcher template. The publisher
embeds a pinned kit URL, hash and length into a single .cmd with a PowerShell body.
It verifies the download before executing code, safely extracts a fresh isolated
build attempt under LOCALAPPDATA/GrindZone/WildlifeReserve, and invokes the canonical
Build-Windows.ps1 with Package and Play. It does not overwrite Frontline or saves.
The child PowerShell uses process-scoped RemoteSigned; no persistent execution-
policy setting is written and enforced organizational policies remain authoritative.

BuildSupport.ps1 finds existing UE5.7 via UE_ROOT, Epic's installation metadata,
registry or the ordinary installation path. It does not silently install Unreal,
accept licensing or install a compiler. Missing prerequisites stop with local logs.
Build-Windows.ps1 locks concurrent execution, compiles, imports, validates a fresh
run-bound receipt, packages to a unique path, then starts the actual resulting game
only on success. PLAY-WILDLIFE.cmd is written only after successful packaging.
A process-started result is never a walkthrough/performance/visual-quality pass.

Fixed a real source-level orientation error: Unreal Python Rotator positional
arguments are roll,pitch,yaw, not the old importer array's pitch,yaw,roll.
Player start and sun now use named fields. Official reference:
https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/Rotator?application_version=5.7
The importer now reopens the saved map and verifies instance count/player rotation;
it fingerprints content before reusing an old map, and records current invocation,
importer/support identities and failures so a stale success cannot hide a new error.
These are implemented code paths, NOT yet exercised inside Unreal.

## What actually passed

Ten new local Python helper/source tests passed. On the existing Render Linux
builder, 27 Python tests passed (the existing 17 transport tests plus 10 new tests).
Microsoft's hash-verified portable PowerShell 7.4.6 parsed the build scripts and
exercised synthetic receipt, version/path and archive-extraction cases successfully.
The exact generated launcher payload parsed successfully too. Fixture engine files
were never executed and are not native compiler proof. No .exe was compiled here.

The existing export was reused and fully revalidated: 113 shared meshes, 71074
scenery placements, 24 material records and 45 textures. Source art and FBX payloads
were not rerendered or re-exported. Original kit b4eb2495a9fedb375c76f6b04147771aed73bd3b0f89b55d19a1ffe233cd7fff
is retained at /unreal01/base_4a056f3.zip and its earlier download URL. Existing
art, prior packages, macro layout and previous transport status are preserved.
Native Blender source remains 0.3.1, hash
6fdfe8d118d4ec8f9f009e397d771eea56bdf50986af99c3a6889405e16314e1.
The previous detailed transport checkpoint remains in git at
753a458d8ee4b1d0528e129c63167f55c6f859c6, same checkpoint path.

Direct post-deploy web fetches were unavailable in this session. Render's exact
live deployment and generated hashes were verified; post-deploy HTTP/download,
Windows 5.1 shell, actual registry discovery and end-to-end native build are NOT
claimed tested. All failure/success diagnostics from a user launch remain local;
there is no automatic log upload or assistant notification channel.

## Native acceptance is still open

Unreal compilation: NOT RUN. Unreal map import: NOT RUN. Windows executable:
NOT BUILT. Player-controlled walkthrough: NOT RUN. Visual quality: NOT ACCEPTED.
Twenty-one material records still require native reconstruction/review. The new
launcher does not fix those graphs, improve the art or prove collision/performance.
The detailed district remains separate from the macro reserve. Wildlife gameplay,
reproduction, NPC/player leases and embedded GrindZone remain separate unfinished
runtime work. Do not substitute a launcher for delivery of the actual game.

## Next exact action / retry safety

The user must launch START-WILDLIFE.cmd once on their Unreal Windows PC, or provide
an authorized non-DC native runner. No such access was found in current tools or
scoped context; do not re-audit unrelated repositories to conceal that boundary.
After a real run, inspect BuildReports/<run>/build-result.json and stage logs;
resolve the actual compiler/import/cook failure, then verify a packaged walkthrough.
Do not invent receipt results or claim access to those local files without a tool.

blender/build_preview.sh now delegates to unreal/Tools/build_windows_entry.sh.
This runs source/helper checks and publishes the launcher while reusing existing
assets. Documentation-only checkpoints must not trigger another build. Preserve
the current immutable release path on later publications; do not strand a pinned
launcher by deleting its kit. Do not rerender art, create another service, enable
payments, change Frontline or use Desktop Commander. Production apps and game
saves remain unchanged.
