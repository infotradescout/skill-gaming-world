# Private Preview Verification

This suite verifies an already-running configured Monetaire Play preview. It
never starts the local safe-demo server and is intentionally excluded from
`npm run check`.

## Live prerequisites

The target must:

- be reachable at an HTTPS origin;
- emit `X-Robots-Tag: noindex, nofollow, noarchive`;
- run with `DEMO_MODE=false`;
- have all reviewed migrations applied and return HTTP 200 from `/api/health`;
- report configured database, schema, jurisdiction, and preview-owner
  dependencies as ready;
- set `PREVIEW_OWNER_EMAIL` to the same normalized address supplied to the test
  runner;
- keep every prize, payment, payout, redemption, Social Casino, and real-money
  casino feature flag false;
- have no admin role assigned to the preview-owner account.

The test runner must have:

- `PREVIEW_BASE_URL` set to the preview origin, with no credentials, query
  string, or fragment;
- `PREVIEW_OWNER_EMAIL` set to the configured owner email;
- `PREVIEW_OWNER_PASSWORD` set to the existing owner's password, or to the
  password that should be used when the suite creates the account for the first
  time;
- Chromium installed for Playwright, or
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` set to a compatible Chromium binary.

Do not place these values in committed files or command history. Supply them
through the test runner's secret environment.

## Run

```sh
npm run test:e2e:configured-preview
```

Desktop Chrome and Pixel 7 projects run serially against the same owner account.
The suite:

- checks configured readiness;
- verifies a non-owner receives only the generic invalid-credentials response;
- creates the owner account if it does not exist, then proves owner login;
- proves an authoritative practice session survives a browser reload;
- proves held feature gates and the casino shell remain denied;
- proves the safe-demo Play Coin package adapter is denied;
- proves the owner has no privileged admin API or page access.

The suite creates or resumes a noncash practice session. It does not apply
migrations, grant admin roles, charge a card, issue Play Coins, deploy code, or
activate a held operation.
