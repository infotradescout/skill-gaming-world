# Architecture decisions

This is the decision register. “Accepted” means accepted for repository design,
not legally approved or implemented. “Hold” means server-disabled and
nonexecutable until the listed authority releases it.

| ID | Status | Decision | Consequence |
| --- | --- | --- | --- |
| D-001 | Accepted | Use a dedicated Skill Gaming World repository. | No TradeScout, MealScout, Sway, Albion, Merlin, or AutoBott coupling. |
| D-002 | Accepted | Public parent is Skill Gaming World; first title is Monetaire. | Present “Monetaire — Competitive Solitaire.” |
| D-003 | Accepted | Preserve `CASINO_WORKING_TITLE` internally. | Do not invent or publish a casino name. |
| D-004 | Accepted | One account/site, two selectors, four operating modes. | Navigation does not confer cross-mode authority. |
| D-005 | Accepted | Initial executable scope is noncash `MONETAIRE_PLAY`. | Other modes deny everywhere. |
| D-006 | Accepted | Play Coins are nonredeemable entertainment units. | No cash value, transfer, resale, redemption, valuable output, or prize/casino funding. |
| D-007 | Accepted | Use three isolated ledger types and no transfer graph. | No shared balance or generic cross-ledger API. |
| D-008 | Accepted | Ledger entries are integer, append-only, balanced, and reversible only by new entries. | Silent mutation is impossible by design. |
| D-009 | Accepted | Skill Prize and Casino eligibility are independent. | One approval never grants the other. |
| D-010 | Accepted | Restricted requests use fresh server jurisdiction decisions. | Client location/profile state cannot authorize. Unknown means deny. |
| D-011 | Accepted | Feature authorization is server-side, exact-operation, and fail-closed. | UI toggles and environment shortcuts are insufficient. |
| D-012 | Accepted | Monetaire uses versioned Klondike Draw 1, deterministic deals, and server-authoritative moves/time. | Sessions are reproducible and client tampering cannot define results. |
| D-013 | Accepted | Ranked deals come from a curated `VERIFIED_SOLVABLE` library. | Arbitrary generated deals are not represented as solvable. |
| D-014 | Accepted | Ranked competition publishes a commitment and later seed reveal. | Published deal/rules are immutable and independently recomputable. |
| D-015 | Accepted | Score order is completion, fewest moves, server duration; exact ties remain ties. | No random or spending-based tiebreaker. |
| D-016 | Accepted | Fraud flags require review and appeal. | A flag is not automatic proof or silent forfeiture. |
| D-017 | Accepted | Self-exclusion is server-enforced and outside ordinary support authority. | Cross-device/session bypass is denied and actions are audited. |
| D-018 | Accepted | Admin authority is least privilege with append-only adjustments and dual control for critical actions. | `SUPER_ADMIN` cannot bypass evidence or audit. |
| D-019 | Accepted | Identity evidence is separated from gameplay telemetry. | Shared vault may provide claims but not shared eligibility approval. |
| D-020 | Accepted | Initial package acquisition is local/provider sandbox only. | No production charging or live credential path. |
| D-021 | Hold | `MONETAIRE_PRIZE`, including free/paid entry, valuable awards, and payout. | Requires written jurisdiction matrix and operational release packet per operation. |
| D-022 | Hold | `SOCIAL_CASINO` game execution. | Only unavailable shell exists pending legal/consumer/payment/distribution approval. |
| D-023 | Hold | `REAL_MONEY_CASINO`, cash ledger, games, deposit, wager, and withdrawal. | Requires licenses/market access and full regulated operating environment. |
| D-024 | Hold | Production Play Coin sales. | Requires counsel, provider, tax, consumer, app-store, security, and operational approval. |
| D-025 | Accepted | Free play is the production gameplay contract, not a simplified demo. | A future legally enabled real-money mode must use the same game rules, odds, scoring, fairness verification, and difficulty. Only the regulated value-transfer layer and jurisdiction access may differ. |
| D-025 | Unresolved | Base age/minor policy. | Unknown/ineligible age follows fail-closed policy until counsel/privacy/distribution approval. |
| D-026 | Unresolved | Final entity/corporate separation. | Counsel and accounting must approve HoldCo/operator/casino structure. |
| D-027 | Unresolved | Monetaire trademark/domain/app-store clearance. | Treat name as working until professional clearance. |
| D-028 | Accepted | The executable ranked catalog is safe-demo-only and requires a distinct seed-encryption key. | Random seed/nonce material is encrypted and frozen per process; missing/rotated keys deny entry, and production requires durable encrypted publication storage. |
| D-029 | Accepted | Production cannot enable the in-memory demo adapter. | `NODE_ENV=production` with `DEMO_MODE=true` is invalid configuration. |

## Decision change process

Add a new row or superseding decision; do not rewrite history. A change records
date, proposer, technical evidence, security/privacy/legal impact, approvers,
affected gate keys, migration/rollback plan, and documents updated.

No `Hold` decision becomes `Accepted` solely because code exists, tests pass, a
competitor offers the feature, or a UI is hidden.
