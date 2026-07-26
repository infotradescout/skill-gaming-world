# Product architecture

## Purpose

One identity and one public site support four operating modes without allowing
the modes to share eligibility, value, or restricted operations.

```text
Browser/PWA
  -> Next.js route boundary
  -> authentication and account restriction
  -> trusted request/location context
  -> jurisdiction decision
  -> server feature authorization
  -> mode-specific application service
  -> mode-specific persistence and append-only audit
```

Every arrow is a server trust boundary. UI visibility is presentation only.

## Mode matrix

| Mode | Value model | Initial execution |
| --- | --- | --- |
| `MONETAIRE_PLAY` | Nonredeemable `PLAY_COIN` | Allowlisted Play functionality |
| `MONETAIRE_PRIZE` | Reserved `SKILL_PRIZE_USD` | Denial only |
| `SOCIAL_CASINO` | Nonredeemable `PLAY_COIN` | Shell; no game execution |
| `REAL_MONEY_CASINO` | Reserved `CASINO_CASH_USD` | Denial only |

`MONETAIRE_PRIZE`, `SOCIAL_CASINO`, and `REAL_MONEY_CASINO` must not be
reachable by adding a query parameter, calling an internal endpoint, changing a
client flag, or editing local storage.

## Bounded contexts

| Context | Owns | Must not own |
| --- | --- | --- |
| Account | User, profile, auth session, device | Cash eligibility |
| Identity vault | Verification evidence and provider references | Gameplay telemetry |
| Eligibility | Separate prize and casino decisions | Wallet balances |
| Jurisdiction | Versioned rules and request decisions | Client UI state |
| Monetaire | Rulesets, deals, sessions, moves, scores | Payment decisions |
| Competition | Entries, immutable publication, leaderboard, appeals | Cross-ledger transfer |
| Ledger | Balanced entries and account balances | Eligibility approval |
| Responsible play | Limits, cooldown, self-exclusion | Support overrides |
| Administration | Role grants and attributed commands | Silent mutation |
| Audit | Immutable security/business events | Editable source records |

The identity vault may later serve both `SKILL_PRIZE_VERIFICATION` and
`CASINO_VERIFICATION`, but it returns claims to two independent eligibility
evaluators. It is not a shared approval.

## Application layers

1. **Route layer** — parses input, authenticates, applies CSRF/rate limiting,
   creates the trusted request context.
2. **Policy layer** — checks account status, location freshness, jurisdiction
   rule version, eligibility, accepted terms, self-exclusion, and server gates.
3. **Command layer** — mode-specific commands with explicit types; no generic
   `transfer`, `wager`, or `payout` command.
4. **Domain layer** — deterministic game engine, competition lifecycle, ledger
   invariants, and responsible-play state machines.
5. **Persistence layer** — transactional PostgreSQL writes, sequence locks,
   append-only events, and immutable published records.
6. **Evidence layer** — audit events, fairness commitments, decision records,
   security logs, and operator-visible histories.

## Data ownership

Use separate tables and explicit foreign keys. Do not use a single `balance`
column on `User`. Store amount-bearing records as integer minor units. A ledger
transaction is valid only when entries balance to zero inside one ledger type
and unit.

The minimum domain entities are:

`User`, `UserProfile`, `Session`, `DeviceRecord`, `IdentityVerification`,
`SkillPrizeEligibility`, `CasinoEligibility`, `JurisdictionRule`,
`JurisdictionDecision`, `FeatureGate`, `SelfExclusion`,
`ResponsibleGamingLimit`, `GameDefinition`, `RulesetVersion`, `Deal`,
`DealValidation`, `Competition`, `CompetitionEntry`, `GameSession`,
`MoveEvent`, `Score`, `LeaderboardSnapshot`, `FraudFlag`, `FraudReview`,
`Appeal`, `Ledger`, `LedgerAccount`, `LedgerEntry`, `PlayCoinPackage`,
`SandboxPurchase`, `Achievement`, `UserAchievement`, `AdminRole`,
`AdminAction`, `AuditEvent`, `TermsVersion`, and `UserTermsAcceptance`.

## Public route families

- Public: `/`, `/monetaire`, `/monetaire/play`,
  `/monetaire/competitions`, `/monetaire/how-it-works`, `/fairness`,
  `/legal/play-coins`, `/legal/terms`, `/legal/privacy`,
  `/responsible-play`.
- Account: `/account`, `/account/history`, `/account/settings`.
- Player: `/app`, `/app/monetaire`, `/app/monetaire/practice`,
  `/app/monetaire/competitions`, `/app/wallet`, `/app/achievements`,
  `/app/eligibility`, `/app/responsible-play`.
- Admin: `/admin`, `/admin/users`, `/admin/competitions`, `/admin/deals`,
  `/admin/fraud`, `/admin/appeals`, `/admin/ledger`,
  `/admin/jurisdictions`, `/admin/feature-gates`, `/admin/audit`.

Admin paths require server authorization per action, not merely an admin layout.

## Availability and failure

- A missing environment variable, policy version, feature record, or location
  decision is a denial for restricted commands.
- Policy and game commands fail atomically; no balance or score is updated
  after a partial failure.
- Cache entries never outlive the eligibility/location evidence they summarize.
- Database outages deny state-changing commands. No offline queue may invent a
  game move, balance, competition entry, or eligibility decision.
- Practice UI may render while disconnected, but accepted moves and official
  state are those acknowledged by the server.

## Architecture holds

No production payment provider, payout provider, geolocation vendor, KYC/AML
vendor, tax vendor, certified casino game provider, or licensed market-access
partner is selected by this document. Their interfaces remain ports with no
production adapter until the applicable hold is released.
