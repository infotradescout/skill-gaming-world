# Robot Combat authority repair — second batch

Status: **draft implementation; not merged, deployed, or production-ready**.

Parent: `c6647d98178dcc5d62d0cad972534a04f7124b7b`, continuing [PR #42](https://github.com/infotradescout/skill-gaming-world/pull/42). The first batch's database/readiness repairs are preserved. No production database, deployment configuration, money operation, dependency, historical migration, Monetaire rule, or desktop packaging was changed in this batch.

## Implemented behavior

New matches identify `ROBOT_COMBAT_RULES_V2`. Existing V1 records retain their identity and gameplay state, but reject new gameplay commands. Saved blueprints are not relabeled or rewritten. This is versioning of a reversible repair, not owner approval of final balance or final game design.

The service owns a persisted start epoch. It samples server time after the match lock and duplicate-receipt lookup. Movement advances in epoch-aligned 50-millisecond steps. Browser TICK deltas are compatibility input and are ignored. More refresh requests, another player, or a JSON snapshot reload cannot add extra elapsed time. Repeated action identifiers recover their earlier outcome before new time is applied.

Accepted clock advances are persisted separately from player commands, including refresh requests. A rejected command therefore has equal before/after gameplay hashes even when server time advanced before the attempted command. Server clock event identifiers use an alphabet unavailable to player action identifiers. Late rejected commands preserve the original completion timestamp and result. Accepted private resets clear old completion and terminal-reason columns.

Machines start apart and face each other. Attacks check weapon reach, facing, and catalog cooldown. Disabled frame/power/weapon state prevents firing; disabled drive/power/frame state prevents movement while still permitting braking. Wheel/track speed and steering attributes affect movement; catalog armor protection affects damage. Private contact trials require a new movement-generated contact and cannot be repeated from one held contact.

The browser accepts only newer snapshots for the same match. Sequence ordering allows a genuine private reset to return the clock to zero while preventing stale replies from rolling a match backward. A synchronous in-flight guard prevents duplicate control submissions before the busy state renders. Lost replies no longer claim that no command was recorded. Existing layout and the separate 3D-view link are preserved.

## Verification executed

Node 22.16.0 executed the actual checked-in test files through the isolated compatibility runner in `tools/verify-robot-repair-isolated.cjs`. TypeScript transpilation supplies execution; the Node test API supplies describe/it/afterEach. This is **not a full Vitest invocation**.

| Group | Passed | Scope |
| --- | ---: | --- |
| Domain, clock, response ordering | 84 | Actual pure game/clock/snapshot code; synthetic machines and controlled server observations |
| In-memory service wiring | 8 | Actual service functions with environment, access, and database imports explicitly doubled by the runner |
| Configured-service transaction contract | 11 | Actual configured command function against mocked transaction operations; checks access/lock/lookup ordering, event hashes, timestamps, replay, and private reset |
| Total | 103 | Zero failed, skipped, or cancelled tests in these three groups |

The configured-service tests do **not** prove PostgreSQL execution, generated SQL, row locking, rollback, constraints, real authentication, or deployment behavior. The first batch's 94 SQL checks are historical evidence and were not rerun for this batch.

Strict TypeScript checking passed for the domain reducer, clock helper, snapshot helper, and unchanged retry-binding helper using installed Node type declarations. All eleven available TypeScript/TSX files syntax-transpiled without errors, and the isolated runner passed `node --check`. This is not full repository type checking, linting, or a configured production build.

The sibling tested-file manifest records Git blob identities for the eleven implementation/test/runner files. Publication must retain those identities. The runner uses an installed `typescript` package, or an explicit `TYPESCRIPT_PATH`, and downloads nothing. It is an additional diagnostic, never a substitute for the normal release suite.

## Explicit limitations and remaining work

The repaired collision/reach model is a conservative **2D chassis envelope**. It is not per-part 3D collision, momentum, lifting, articulation, weapon animation, or final competitive balance. In particular, the impact ram remains an activated weapon inside this provisional envelope, not a proved velocity-based physical ram. Those game-design and runtime requirements remain open.

Moving sessions requiring more than 60 seconds of unprocessed simulation are held without changing their gameplay state or inventing a winner. A proved long-interruption recovery path remains required before release. Stationary sessions can advance long elapsed periods without an expensive movement loop. There is no new background worker or service.

The browser still requires rendered verification, full uncertain-command recovery, timeouts/backpressure, reviewed V1 read-only messaging, mobile/keyboard controls, and unification with the 3D runtime. A passing response-order helper test does not prove the React page or actual network behavior.

Still required: full dependency installation, full typecheck/lint/Vitest/build, actual configured database service flows, concurrent transactions, restart/reload against PostgreSQL, fresh two-account browser gameplay, all eleven migrations on a clean database and the real ten-to-eleven upgrade, launcher availability wiring, and scoped production authorization. No production readiness claim is made.

Monetaire timing, uncertain-move recovery, input/accessibility, storage resilience, complete independent card-face designs, and broader verified-solvable deal variety remain unchanged by this batch. Stock-pass approval remains unresolved. Account/location evidence and packaging/scaling work also remain outstanding.

## Product basis

The [implementation intent lock](../product-definition/ROBOT_COMBAT_IMPLEMENTATION_INTENT_LOCK_20260811.md) requires build, test, fight, learn, and rebuild, and explicitly distinguishes a reversible prototype from production proof. The source catalog already provides reach, cooldown, speed, steering, and protection attributes. Applying them here repairs previously unused rules; it does not convert provisional numbers into approved final balance.
