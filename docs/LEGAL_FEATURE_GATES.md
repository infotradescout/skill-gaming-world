# Legal feature gates

## Rule

Feature gates are server authorization data, not UI flags. The server evaluates
them at every restricted route and command. Missing records, unknown values,
provider errors, expired approvals, or contradictory state are `DENY`.

## Initial gate registry

| Gate | Default | Initial capability |
| --- | --- | --- |
| `mode.monetaire_play` | `DENY` | May be allowlisted by jurisdiction |
| `play_coin.earn` | `DENY` | Allow only with Play policy |
| `play_coin.package.sandbox` | `DENY` | Allow only in explicit sandbox |
| `play_coin.package.production` | `DENY` | Hold |
| `mode.monetaire_prize` | `DENY` | Hold |
| `prize.entry.free` | `DENY` | Hold |
| `prize.entry.paid` | `DENY` | Hard hold |
| `prize.award.valuable` | `DENY` | Hard hold |
| `prize.payout` | `DENY` | Hard hold; no route |
| `mode.social_casino` | `DENY` | Hold |
| `social_casino.game_execution` | `DENY` | Hard hold; no route |
| `mode.real_money_casino` | `DENY` | Hold |
| `casino.deposit` | `DENY` | Hard hold; no route |
| `casino.wager` | `DENY` | Hard hold; no route |
| `casino.withdrawal` | `DENY` | Hard hold; no route |
| `casino.game_execution` | `DENY` | Hard hold; no route |

The Casino navigation shell is not a gate and conveys no capability.

## Gate record

A gate version records key, mode, operation, environment, jurisdiction scope,
decision, effective window, required eligibility, approval references, actor,
reason, and audit event.

No wildcard operation or “all cash features” shortcut is allowed. Production
and sandbox are separate enumerated operations.

## Enforcement points

1. route middleware rejects unavailable route families;
2. controller builds trusted context and calls the jurisdiction engine;
3. application command validates the exact gate and decision again;
4. repository/database constraints protect ledger and immutable records;
5. audit records both allowed state-changing commands and denied restricted
   attempts.

Background jobs, admin tools, internal APIs, queues, and replay workers use the
same policy service. “Internal” is not an exemption.

## Release authority

A restricted gate change requires:

- written counsel determination for the feature/jurisdictions;
- approved product rules and public disclosures;
- security, privacy, fraud, responsible-gaming, support, payment, tax, and
  distribution evidence applicable to the feature;
- named compliance authorization;
- change review and rollback/kill-switch plan;
- append-only audit event.

No single administrator or deployment environment variable may activate a cash
mode. Ordinary support has no gate authority.

## Defense against accidental activation

- Production startup rejects `ALLOW` for an undocumented gate.
- Build/test fixtures cannot set production gate rows.
- A deployment cannot create cash routes merely by enabling a flag; initial
  cash handlers do not exist.
- An emergency global deny overrides all allows.
- Gate evaluation telemetry excludes secrets and sensitive identity data.

