# Skill Gaming World

Skill Gaming World is the parent experience for skill-based entertainment. It
currently includes **Monetaire — Competitive Solitaire** and the playable,
free **Bay 13: The Scrapyard** robot-combat training slice.

This repository is intentionally structured around one account and one site
with two top-level product selectors:

- **Skill Gaming World** — Monetaire Play and Bay 13 local training; prize
  competition capability remains under a separate legal and technical hold.
- **Casino** — an unavailable shell identified internally only as
  `CASINO_WORKING_TITLE`; social-casino execution and real-money casino
  operations remain disabled.

## Current boundary

The executable product is limited to **MONETAIRE_PLAY** plus Bay 13's free,
no-value local training mode:

- deterministic Klondike Solitaire, Draw 3;
- practice and noncash ranked competition;
- achievements, rankings, and nonredeemable Play Coins;
- sandbox-only package simulation;
- responsible-play controls, auditability, and public fairness information.

Bay 13 adds a browser-playable Godot vertical slice with three starter robots,
a training opponent, garage customization, validated blueprint save/load, and
tested authoritative networking primitives. Hosted PvP is not yet offered.

The repository must not expose paid prize entry, valuable prizes, cash payout,
redeemable currency, casino deposits, casino wagers, casino withdrawals, or
casino game execution. The three restricted modes fail closed:

| Mode | Initial state | Release authority |
| --- | --- | --- |
| `MONETAIRE_PLAY` | Safe-demo adapter only; configured runtime denies until a request jurisdiction adapter exists | Product, security, privacy, and launch gates |
| `MONETAIRE_PRIZE` | Disabled everywhere | Written counsel matrix plus explicit operational approval |
| `SOCIAL_CASINO` | Disabled everywhere | Written counsel and distribution approval |
| `REAL_MONEY_CASINO` | Disabled everywhere | Licensing/market access and all regulatory approvals |

Missing, stale, conflicting, or unrecognized authorization data means **deny**.
A visible UI control is never authorization.

## Noncash trust statement

> Play Coins have no cash value. Play Coins cannot be withdrawn, transferred,
> sold, or redeemed. Monetaire Play does not award cash or valuable prizes.
> Prize competitions are unavailable unless separately enabled for an eligible
> player and jurisdiction. Casino cash wagering is not currently available.

No fake players, winners, activity, jackpots, prize totals, or testimonials may
be placed in production-facing data.

## Legal status

This repository is a technical design and implementation workspace. It does
**not** establish legality, licensure, payment approval, app-store approval,
regulatory acceptance, test completion, production readiness, or deployment
status. Qualified counsel must approve the feature-by-feature jurisdiction
matrix before any prize, social-casino, or real-money capability is activated.

Start with:

- [Product architecture](docs/PRODUCT_ARCHITECTURE.md)
- [Product and brand boundaries](docs/PRODUCT_BOUNDARIES.md)
- [Legal feature gates](docs/LEGAL_FEATURE_GATES.md)
- [Currency isolation](docs/CURRENCY_ISOLATION.md)
- [Monetaire fairness contract](docs/MONETAIRE_FAIRNESS_CONTRACT.md)
- [Bay 13 runtime requirements](docs/NEXT_RUNTIME_BUILD.md)
- [Bay 13 Godot runtime](games/robot-combat/godot/README.md)
- [Counsel questions](docs/LEGAL_COUNSEL_QUESTIONS.md)
- [Launch checklist](docs/LAUNCH_CHECKLIST.md)
- [Work Mode handoff](WORK_MODE_HANDOFF.md)

## Local commands

```bash
cp .env.example .env.local
npm install
npm run dev
npm run check
npm run test:e2e
npm run robot-combat:verify-runtime
npm run robot-combat:export-web
```

Use distinct random values for `SESSION_SECRET` and
`COMPETITION_SEED_ENCRYPTION_KEY`. Ranked demo entry fails closed if the
dedicated seed-encryption key is missing. The demo competition publication is
randomly generated, encrypted, and immutable for that process; it is not a
production publication store.

`npm run build` validates configured-runtime requirements and therefore rejects
`DEMO_MODE=true`. `npm run check` uses a nonconnecting configured-mode build
verification command; it does not start a database or deploy anything.

The existence of a command does not mean it has passed. Record actual output,
environment, and date whenever evidence is used for a release decision.
