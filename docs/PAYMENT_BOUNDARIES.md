# Payment boundaries

## Initial payment surface

Only a sandbox Play Coin package simulation is permitted. It must:

- use provider sandbox or a local deterministic adapter;
- use unmistakably nonproduction credentials and environment labels;
- avoid charging, authorizing, capturing, settling, or storing a real card;
- produce a sandbox receipt that can credit only `PLAY_COIN`;
- be idempotent and auditable;
- never create cash-ledger entries.

Production payment adapters and credentials are absent/disabled.

## Bounded ports

| Port | Initial adapter | Cash effect |
| --- | --- | --- |
| Play Coin package | Local/provider sandbox | None |
| Prize entry payment | None | Forbidden |
| Prize payout | None | Forbidden |
| Casino deposit | None | Forbidden |
| Casino withdrawal | None | Forbidden |
| Casino wager/settlement | None | Forbidden |

There is no generic `PaymentIntent` command that accepts an arbitrary product,
ledger, or flow. Provider webhooks must resolve to an expected environment,
provider account, product operation, amount, package, user, and idempotency
record before any posting.

## Environment separation

- Separate sandbox/live account identifiers and secrets.
- Startup rejects live credentials unless a separately approved production
  adapter and gate manifest are present.
- Test and preview builds cannot reach live provider endpoints.
- Webhook signatures, replay windows, event uniqueness, amount/package
  matching, and out-of-order delivery are enforced.
- Logs never include payment credentials or secret webhook payload fields.

## Consumer protection

Before a package action, show exact price, quantity, noncash terms, refund path,
and recurring status (initial packages are not recurring). Do not preselect,
count down, create false scarcity, or obscure the total. Receipts and history
must distinguish sandbox from a future real transaction.

Payment failure cannot debit or grant coins. An uncertain provider state enters
review; it is not guessed. Refund/chargeback behavior must use append-only
reversals under an approved policy.

