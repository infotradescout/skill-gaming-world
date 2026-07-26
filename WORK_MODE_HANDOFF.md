# Skill Gaming World Work Mode handoff

## Authority and target

Treat this repository as the dedicated Skill Gaming World codebase. Do not move
its models or functionality into TradeScout, MealScout, Sway, Albion, Merlin,
AutoBott, or another product.

Public platform: **Skill Gaming World**  
First title: **Monetaire — Competitive Solitaire**  
Unannounced casino label: **`CASINO_WORKING_TITLE`**

Before any Git operation, inspect the connected repository, its visibility,
default branch, governance, open pull requests, and working tree. This handoff
does not itself assert a branch, commit, pull request, deployment, or passing
check.

## Authorized implementation scope

Build a mobile-first PWA using TypeScript, Next.js App Router, React,
PostgreSQL, Drizzle, Vitest, and Playwright, with Neon-compatible database
configuration and Render-compatible deployment configuration, unless the
inspected repository already establishes a different production convention.

The working surface is `MONETAIRE_PLAY`:

1. landing and trust pages;
2. registration and secure login;
3. player dashboard and game lobby;
4. Klondike Draw 1 practice play;
5. deterministic noncash ranked competition;
6. nonredeemable Play Coin ledger and history;
7. sandbox-only package simulation;
8. achievements and rankings;
9. responsible-play settings;
10. admin review and append-only audit history;
11. separate eligibility placeholders;
12. fail-closed jurisdiction and feature decisions;
13. unavailable Casino shell.

Do not implement or expose:

- paid prize entries or cash/valuable prizes;
- any payout, redemption, conversion, or transfer route;
- production card charging;
- social-casino game execution;
- casino deposits, wagering, withdrawals, or game execution;
- a shared or generic cross-currency transfer API.

## Invariants

Every implementation decision must preserve:

- Play Coins have no cash value and produce nothing of real-world value.
- `PLAY_COIN`, `SKILL_PRIZE_USD`, and `CASINO_CASH_USD` are isolated ledger
  types with no conversion path.
- `SkillPrizeEligibility` and `CasinoEligibility` are separate decisions.
- A restricted operation needs a fresh server decision; the client cannot
  self-declare location, age, identity, or eligibility.
- Unknown or conflicting policy state denies access.
- Self-exclusion is enforced before game/session creation and cannot be removed
  by ordinary support.
- Ranked entrants receive one immutable deal and ruleset.
- Official moves and time are server-authoritative.
- Balance, score, competition, and rules corrections are append-only and
  attributed.

Read the documentation index in [README.md](README.md), then the data,
fairness, gate, threat, privacy, and hold specifications before changing domain
code.

## Execution sequence

1. Inspect repository state and existing conventions.
2. Create a clean feature branch without overwriting unrelated work.
3. Reconcile code against the documents in `docs/`; record proposed decision
   changes in `docs/DECISIONS.md`.
4. Implement strict environment validation and secret-safe logging.
5. Implement authentication, authorization, and the documented domain model.
6. Implement the isolated append-only Play Coin ledger.
7. Implement server-created Monetaire sessions and move validation.
8. Add practice mode and session resume.
9. Add immutable, noncash ranked competitions and fairness reveal.
10. Add server-side eligibility, jurisdiction, restriction, and feature gates.
11. Add responsible-play and least-privilege admin controls.
12. Add public trust, history, terms, privacy, and fairness surfaces.
13. Add unit, integration, and browser coverage.
14. Run format/lint/typecheck/test/build and record actual outputs.
15. Verify desktop and mobile gameplay manually; record the device/viewport,
    build, route, result, and defects.
16. Inspect the complete diff for forbidden money paths, fake activity, secrets,
    and cross-brand leakage.
17. Commit and push only confirmed work; open or update a pull request when the
    connector permits.
18. Do not merge unless repository governance explicitly permits it.

Do not create production infrastructure or incur a paid service without
explicit authorization. If approved nonproduction credentials and an existing
preview target are available, a preview may be used; it must remain incapable of
production payments, prizes, and casino operations.

## Required automated evidence

At minimum, tests must prove:

- a seed and ruleset reproduce the same deal;
- every ranked entrant receives the same immutable deal;
- illegal, duplicate, replayed, and out-of-order moves are rejected;
- client clock changes cannot change an official score;
- exact ties remain ties;
- active competition deals and rules cannot be edited;
- Play Coins cannot enter a cash ledger and cash ledgers cannot fund Play Coins;
- Skill Prize approval does not grant Casino approval;
- direct calls cannot bypass disabled modes or jurisdictions;
- scoped self-exclusion blocks session creation;
- balance and score adjustments create complete audit records;
- no deposit, payout, real-money wager, or production-charge route exists;
- sandbox receipts cannot become real charges;
- production data contains no fake player or winner fixture.

Browser evidence must cover registration, login, practice start/completion,
resume, noncash competition entry, leaderboard, Play Coin history, cooldown,
self-exclusion, disabled Prize and Casino access, and mobile gameplay.

## Release evidence format

The final report must state only verified facts:

1. repository and default branch inspected;
2. branch and exact commits created;
3. pull request URL, if any;
4. functionality implemented;
5. migrations created/applied and target environment;
6. commands run with actual results;
7. manual browser evidence;
8. preview/deployment state;
9. legal, payment, and distribution holds;
10. known defects and limitations;
11. exact next action.

Never infer legality or production state from a green build. Never fabricate
commits, URLs, screenshots, metrics, tests, deployment, licensing, or approval.
