# Private Preview Verification

This suite verifies an already-running configured Monetaire Play preview. It
never starts the local safe-demo server, is intentionally excluded from
`npm run check`, and refuses the production origin. The two-account scenario
must use an isolated hosted service and isolated database branch because it
creates ordinary accounts, competition entries, sessions, moves, scores, and
achievement evidence.

Before its first mutation, the two-account scenario requires `/api/health` to
return the exact operator-supplied configured E2E target ID and a SHA-256
fingerprint derived from the expected database endpoint. A production alias or
a preview accidentally wired to the production database therefore fails the
guard even when its public URL is unfamiliar.

The fingerprint is lowercase SHA-256 of
`postgresql://hostname:port/database-path`; credentials and query parameters are
excluded, so credential rotation does not change target identity.

## Live prerequisites

The target must:

- be reachable at an HTTPS origin;
- emit `X-Robots-Tag: noindex, nofollow, noarchive`;
- run with `DEMO_MODE=false`;
- have all reviewed migrations applied and return HTTP 200 from `/api/health`;
- report configured database, schema, jurisdiction, and preview-owner
  verification dependencies as ready;
- set `PREVIEW_OWNER_EMAIL` to the same normalized verification-account address
  supplied to the test runner; this identifies the owner fixture but does not
  restrict ordinary registration;
- keep every prize, payment, payout, redemption, Social Casino, and real-money
  casino feature flag false;
- have no admin role assigned to the preview-owner account.
- permit ordinary noncash account registration for the two-account proof;
- use an isolated database branch whose test records cannot contaminate
  production history or standings;
- set a preview-only `CONFIGURED_E2E_TARGET_ID` that is absent from production.

The test runner must have:

- `PREVIEW_BASE_URL` set to the preview origin, with no credentials, query
  string, or fragment;
- `PREVIEW_OWNER_EMAIL` set to the configured owner email;
- `PREVIEW_OWNER_PASSWORD` set to the existing owner's password, or to the
  password that should be used when the suite creates the account for the first
  time;
- `PREVIEW_E2E_TARGET_ID` matching the server target ID;
- `PREVIEW_DATABASE_FINGERPRINT` matching the isolated database endpoint
  fingerprint exposed by health;
- Chromium installed for Playwright, or
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` set to a compatible Chromium binary.

Do not place these values in committed files or command history. Supply them
through the test runner's secret environment.

## Run

```sh
npm run test:e2e:configured-preview
```

Desktop Chrome and Pixel 7 projects run serially. The owner fixture verifies
configured readiness and access boundaries, while each two-account run creates
fresh ordinary accounts. The suite:

- checks configured readiness;
- verifies a non-owner receives only the generic invalid-credentials response;
- creates the owner account if it does not exist, then proves owner login;
- proves an authoritative practice session survives a browser reload;
- proves held feature gates and the casino shell remain denied;
- proves the safe-demo Play Coin package adapter is denied;
- proves the owner has no privileged admin API or page access;
- enters two ordinary accounts into the same active
  `KLONDIKE_DRAW_THREE_V2` competition and verifies an identical deal commitment,
  generator, ruleset, tableau, and stock through distinct entry/session IDs;
- denies cross-account session reads and moves and verifies the owner's state
  remains unchanged;
- persists a rejected command, reproduces the exact rejection on retry, then
  accepts a corrected command at the unchanged expected sequence;
- completes the curated deal for one account, records the other as incomplete,
  and observes both results through live leaderboard refresh;
- verifies each authenticated history contains only its own session, entry,
  score, accepted/rejected move evidence, ledger, and achievements, while each
  dashboard shows that account's server-calculated numeric/tied rank;
- verifies `CLEAN_SEQUENCE` is awarded only from a completed session whose
  persisted moves are all accepted.

The hosted suite does not alter the server clock or force competition closure.
Release verification pairs it with database-backed lifecycle coverage proving
that concurrent close requests terminalize unfinished sessions at the stored
cutoff, persist tied incomplete scores, create one immutable hash-verified final
leaderboard, reveal and verify the seed only after closure, and create at most
one successor.

The suite creates or resumes a noncash practice session and creates disposable
noncash competition evidence on the isolated target. It does not apply
migrations, grant admin roles, charge a card, issue Play Coins, deploy code,
activate a held operation, or relax `noindex`. Prizes, payments, payouts,
redemption, Social Casino, real-money casino, and public discovery remain off.

Production promotion follows the traffic-stopped procedure in
[`STAGE2_PRODUCTION_CUTOVER.md`](./STAGE2_PRODUCTION_CUTOVER.md); Render's normal
rolling pre-deploy migration is not sufficient for this upgrade.
