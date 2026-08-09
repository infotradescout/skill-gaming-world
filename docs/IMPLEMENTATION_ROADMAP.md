# Implementation roadmap

This roadmap is an execution order, not a completion report. A phase exits only
with referenced evidence; later restricted modes remain independent holds.

## Foundation — repository and contracts

Deliver:

- dedicated repository conventions and protected environment model;
- this architecture/legal-hold documentation;
- strict configuration validation and secret-safe logging;
- decision, audit, and test evidence templates.

Exit evidence:

- complete review of mode, value, eligibility, jurisdiction, admin, privacy,
  threat, and distribution boundaries;
- no cross-brand imports or copied secrets;
- restricted mode defaults are `DENY`.

## Monetaire Play platform

Deliver:

- public landing/trust/legal/responsible-play surfaces;
- registration, login, account/session/device lifecycle;
- player dashboard, lobby, and unavailable `CASINO_WORKING_TITLE` shell;
- base account restrictions and terms acceptance;
- admin skeleton with least-privilege authorization.

Exit evidence:

- route authorization and direct-call negative tests;
- account closure path;
- accessibility and mobile navigation review;
- no fake social proof or restricted money controls.

## Play Coin ledger and sandbox commerce

Deliver:

- append-only balanced `PLAY_COIN` ledger;
- earning, approved nonvaluable debit, history, reversal, reconciliation;
- package catalog and sandbox-only purchase adapter;
- admin adjustment and audit workflow.

Exit evidence:

- integer/precision/concurrency/idempotency tests;
- all cross-ledger attempts denied;
- live payment credentials/adapters absent;
- full transaction history and adjustment attribution.

## Monetaire engine and practice

Deliver:

- versioned Draw 3 ruleset and deterministic shuffle;
- server-created session, authoritative validation, sequence/idempotency/state
  hash, resume/abandon;
- touch, pointer, and practical keyboard controls;
- solver interface and curated validation records.

Exit evidence:

- deterministic deck reproduction;
- legal/illegal move corpus;
- duplicate/replay/out-of-order rejection;
- resume and terminal-state behavior;
- desktop/mobile manual proof.

## Noncash ranked competition

Deliver:

- immutable competition publication and one deal per competition;
- seed commitment before open and reveal after close;
- server timer/scoring, exact ties, leaderboard snapshots;
- fraud review, appeals, append-only corrections;
- public fairness verification.

Exit evidence:

- every entrant receives identical validated deal;
- active deal/rules mutation denied;
- client clocks cannot affect official score;
- no Play Coin entry debit, paid advantage, cash, or valuable prize.

## Responsible play, administration, and assurance

Deliver:

- time display/reminders, cooldown, scoped self-exclusion, support path;
- role grants, dual-control scaffolding, sensitive-read audit;
- threat mitigations, privacy inventory, incident/backup/restore procedures;
- full unit/integration/browser suite and production build process.

Exit evidence:

- cross-device restriction enforcement and support bypass denial;
- security/dependency/config review;
- restore and emergency-deny exercise;
- actual command results and known defects recorded.

## Monetaire Play release decision

Only the approved Play jurisdictions/features may be allowlisted. Complete
[Launch checklist](LAUNCH_CHECKLIST.md), payment/app-store review where
applicable, counsel-approved terms/privacy/age policy, support readiness, and
observable rollback.

Track real outcomes only after launch: Day 1/7/30 retention, session frequency,
completion, purchase conversion if production packages are separately approved,
revenue per payer, customer-acquisition cost, refund/chargeback, and
fairness/support complaints. Do not fabricate benchmarks or results.

## Future restricted programs

These are separate programs, not automatic phases:

1. **Monetaire Prize research/pilot** — written jurisdiction matrix; consider
   narrow sponsor-funded free-entry fixed prizes first; separate verification,
   payout, tax, fairness, and official-rules evidence. Paid entry remains later.
2. **Social Casino** — only after approved consumer/legal/payment/distribution
   design and demonstrated support/fraud/responsible-play capability.
3. **Real-Money Casino** — licensed operator/market-access path, certified
   providers, banking/player funds, AML/KYC/geolocation, responsible gaming,
   tax, regulator and distribution approval.

No milestone date or business success in Monetaire Play releases a restricted
gate by itself.
