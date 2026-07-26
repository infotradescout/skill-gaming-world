# Launch checklist

All boxes begin unchecked. A link to current evidence, owner, environment, and
date is required before checking an item. This checklist does not assert
readiness.

## Scope and legal boundary

- [ ] Release is explicitly limited to approved `MONETAIRE_PLAY` operations.
- [ ] Written counsel matrix identifies allowed Play jurisdictions, age policy,
      consumer terms, privacy, packages, and noncash competitions.
- [ ] `MONETAIRE_PRIZE`, `SOCIAL_CASINO`, and `REAL_MONEY_CASINO` deny
      everywhere.
- [ ] No paid entry, valuable prize, payout, redemption, cash ledger, deposit,
      wager, withdrawal, or casino game route exists.
- [ ] Casino remains an unavailable `CASINO_WORKING_TITLE` shell.
- [ ] Monetaire name, content, domain, and applicable trademark checks are
      complete; public claims are approved.

## Product and public trust

- [ ] Required no-cash-value/nonredemption copy appears before package actions
      and on fairness, wallet/history, and terms surfaces.
- [ ] No fake players, winners, activity, jackpots, testimonials, prize totals,
      scarcity, near-win claims, or cash imagery exists.
- [ ] Landing, registration/login, dashboard, lobby, practice, competition,
      history, achievements, settings, fairness, legal, privacy, and
      responsible-play paths work at intended viewport sizes.
- [ ] Account deletion/closure and support/refund contact paths work.
- [ ] Accessibility review covers keyboard, focus, labels, contrast,
      non-color feedback, motion, and touch targets.

## Game and fairness

- [ ] Ruleset, shuffle, scoring, and timer versions are immutable and public as
      appropriate.
- [ ] Same seed and versions reproduce the same canonical deal.
- [ ] Ranked library contains only evidence-backed `VERIFIED_SOLVABLE` deals.
- [ ] Server creates sessions and validates moves, sequence, idempotency, replay,
      state hashes, resume, abandonment, and completion.
- [ ] Every entrant receives the competition's identical deal.
- [ ] Commitment is published before open; seed/nonce reveal verifies after
      close.
- [ ] Client clock cannot affect official duration or score.
- [ ] Completion/move/time ordering and exact ties match public rules.
- [ ] Published deal/rules cannot be edited; corrections and appeals are
      append-only.
- [ ] No paid advantage, hidden human-presented bot, or spending-based
      difficulty exists.

## Ledger and sandbox package

- [ ] `PLAY_COIN` entries are integer, balanced, append-only, idempotent, and
      reconcilable.
- [ ] No user balance field or generic transfer API exists.
- [ ] Pairwise cross-ledger, cross-user, unit mismatch, replay, concurrency, and
      rollback tests deny safely.
- [ ] Admin adjustments preserve originals and capture complete attribution.
- [ ] Player history displays each grant/debit/reversal accurately.
- [ ] Package adapter is demonstrably sandbox/local; no live endpoint,
      credential, authorization, capture, or charge is possible.
- [ ] Sandbox webhook/receipt replay and mismatch cases are rejected.

## Eligibility, jurisdiction, and protection

- [ ] Prize and Casino eligibility records/evaluators are separate.
- [ ] Client-provided location cannot authorize an operation.
- [ ] Missing/stale/conflicting rules, evidence, or configuration denies.
- [ ] Restricted route, API, job, admin, and queue direct calls cannot bypass
      policy.
- [ ] Session time, reminder, cooldown, scoped self-exclusion, closure, history,
      and support controls are usable and accurately explained.
- [ ] Self-exclusion propagates across devices and blocked modes and cannot be
      removed by support.
- [ ] Emergency global deny has owner, alert, audit, and exercised procedure.

## Security and privacy

- [ ] Threat model is mapped to implemented controls, tests, monitoring, owner,
      and residual risks.
- [ ] Secure auth/cookies, CSRF where applicable, rate limiting, validation,
      CSP, server authorization, and idempotency are evidenced.
- [ ] Environment validation fails safely; no secrets are committed or logged.
- [ ] Dependency/security review and secret scan have actual recorded results.
- [ ] Data inventory, approved purposes, consent/notices, vendors, retention,
      rights, minor policy, and incident procedure are approved.
- [ ] Identity/precise location/protective data are separated and absent from
      ordinary analytics/logs.
- [ ] Backup/restore and incident-response exercises have actual results.

## Admin and operations

- [ ] Each privileged command enforces least privilege and records actor,
      reason, evidence, before/after, time, and result.
- [ ] Dual-control operations prevent requester from self-approving.
- [ ] Admin auth, session lifetime, grant review, masking, sensitive-read
      logging, and break-glass controls are evidenced.
- [ ] Ledger projection, audit sequence, seed access, denied gate attempts, and
      security signals are monitored with owned alerts.
- [ ] Support has approved scripts for gameplay, packages, restrictions,
      privacy, disputes, and incidents without bypass authority.

## Engineering evidence

- [ ] Formatting/lint command and exact result recorded.
- [ ] Typecheck command and exact result recorded.
- [ ] Unit/integration command and exact result recorded.
- [ ] Browser suite command and exact result recorded.
- [ ] Production build command and exact result recorded.
- [ ] Database migrations reviewed and applied only to the named environment.
- [ ] Registration, login, practice complete/resume, noncash competition,
      leaderboard, history, cooldown, self-exclusion, disabled modes, and mobile
      flows have manual proof.
- [ ] Complete changed-file review found no secrets, fake data, cross-brand
      leakage, forbidden value path, or unsupported status claim.
- [ ] Known defects, limitations, rollback, owner, and exact next action are
      documented.

## Distribution and release

- [ ] Hosting, domain, TLS, environment, observability, backups, support, terms,
      and privacy are approved for the exact release.
- [ ] If native: current Apple/Google policy packet and actual platform
      acceptance are recorded.
- [ ] If production Play Coin sales: counsel, provider underwriting,
      billing/store, tax, refund/chargeback, reconciliation, limit, and
      kill-switch gates are independently complete.
- [ ] Final release approvers reviewed evidence; approval is recorded and
      time-bounded.
- [ ] Post-release metric definitions and truthful reporting are ready; no
      metric value is invented.

