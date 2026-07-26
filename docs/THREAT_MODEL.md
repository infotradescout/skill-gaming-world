# Threat model

## Scope and assumptions

This model covers the initial Monetaire Play web/PWA, account/authentication,
game engine, competitions, Play Coin ledger, admin, audit, and disabled future
mode boundaries. It must be updated for each provider or restricted feature.

Assume the browser, device clock, client state, client location fields, request
headers, and user-supplied data are untrusted. Internal services and admins are
authenticated but not automatically authorized. Database credentials, build
systems, vendors, and operators may be compromised.

## Assets

- account credentials, sessions, device records;
- identity/location evidence and eligibility decisions;
- deterministic seeds before reveal;
- move ledgers, scores, leaderboard, fairness commitments;
- Play Coin entries and projections;
- self-exclusion/restriction state;
- feature/jurisdiction rules and gate approvals;
- audit events and admin grants;
- secrets, deployment configuration, source/build artifacts;
- availability and player trust.

## Primary threats and controls

| Threat | Impact | Prevent/detect |
| --- | --- | --- |
| Credential stuffing/session theft | Account takeover and coin abuse | Strong password/session controls, secure cookies, rate limits, device/session revocation, anomaly alerts |
| CSRF/XSS/injection | Unauthorized commands or data access | CSRF controls, output encoding, CSP, typed validation, parameterized queries, dependency review |
| Forged/replayed move | Better score or corrupt game | Server validation, sequence, idempotency, prior-state hash, immutable events |
| Client clock manipulation | Unfair ranking | Server timer only |
| Deal/seed leak | Precompute advantage | Encrypted seed, least privilege, commitment before open, reveal after close, access audit |
| Competition mutation | Hidden unfairness | Immutable published deal/rules, cancellation rather than edit, audit |
| Fake player/bot | False social proof or unfair competition | Provenance labels, no production fixtures, bot prohibition, abuse review |
| Ledger race/replay | Double credit/debit | Transaction locks, balanced entries, unique idempotency, integer units, reconciliation |
| Cross-ledger confused deputy | Play Coin becomes cash value | Explicit commands/types, no transfer API, database constraints, denied cash routes |
| Jurisdiction bypass | Restricted operation exposed | Trusted location evidence, per-command policy, short decision TTL, direct-call tests |
| Eligibility conflation | Prize approval unlocks casino | Separate records/evaluators/gates and negative tests |
| Self-exclusion bypass | User-protection failure | Pre-command server check, cross-device state, support prohibition, audit |
| Admin misuse | Silent score/balance/gate manipulation | Least privilege, dual control, immutable adjustments, strong admin auth, alerts/review |
| Log/analytics leakage | Exposure of PII/secrets/location | Classification, redaction, separate vault, allowlisted fields, DLP review |
| Supply-chain/build compromise | Malicious code or secret theft | Lockfile, provenance, dependency audit, protected CI, secret scanning, reviewed builds |
| Denial of service | Lost sessions or forced abandonment | Rate limiting, capacity monitoring, atomic resume, documented outage handling |
| Sandbox-to-live confusion | Real charge without approval | Separate credentials/adapters/environments, startup validation, live adapter absent |

## Abuse cases

- One person creates accounts/devices to dominate rankings.
- Colluders share deal solutions after competition opens.
- Automation solves deterministic deals.
- A player disconnects to attempt timer pauses.
- A user sells an account or social inventory to recreate Play Coin value.
- Support is socially engineered into granting coins, removing exclusion, or
  revealing identity data.
- An admin marks a cash gate allowed without supporting approvals.
- A developer adds a “temporary” generic transfer endpoint.
- Test fixtures or fake leaderboard records reach production.
- A stale allow decision is replayed after location, policy, or gate changes.

Controls must combine prevention with review. Fraud flags do not automatically
prove wrongdoing; adverse action follows a documented human-review and appeal
path.

## Security baseline

- strict environment schema and no committed secrets;
- secure authentication, cookie flags, CSRF where applicable, rate limiting,
  and server authorization;
- input/schema validation and secret-safe errors/logs;
- Content Security Policy and dependency audit;
- encryption in transit and approved at-rest protection;
- PII minimization and identity/gameplay separation;
- append-only audit events and idempotent commands;
- backup/restore and incident-response exercises.

## Release evidence

Map every control to owner, implementation reference, automated test, manual
test, monitoring signal, and residual risk. An unchecked control is not
implemented merely because it is listed here.

