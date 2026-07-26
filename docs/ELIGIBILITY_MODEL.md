# Eligibility model

## Independent decisions

Eligibility is not a user boolean. Use separate versioned records:

- `BaseAccountEligibility`
- `SkillPrizeEligibility`
- `CasinoEligibility`

Each record has its own status, basis, evidence references, policy version,
review state, issued/expiry timestamps, and reason codes. Passing one does not
copy, imply, or mutate another.

```text
Base account ----> MONETAIRE_PLAY policy
Identity vault --> Skill Prize evaluator --> SkillPrizeEligibility
Identity vault --> Casino evaluator ------> CasinoEligibility
```

The shared identity vault, if later introduced, supplies evidence only. It does
not grant mode access.

The two future verification workflows are explicitly named:

- `SKILL_PRIZE_VERIFICATION` evaluates evidence and issues a
  `SkillPrizeEligibility` decision.
- `CASINO_VERIFICATION` evaluates its stronger, casino-specific evidence and
  issues a `CasinoEligibility` decision.

They are not aliases, and neither workflow calls the other's approval command.

## Status

Use explicit states:

`NOT_STARTED`, `PENDING`, `APPROVED`, `DENIED`, `EXPIRED`, `REVOKED`,
`REVIEW_REQUIRED`.

Anything other than a current `APPROVED` decision is a denial for the restricted
operation. A review queue is not provisional access.

## Skill Prize evidence reservation

Future evaluation may require:

- identity and counsel-approved age;
- fresh physical location and declared residence;
- jurisdiction eligibility;
- duplicate-account screening;
- payment ownership where required;
- sanctions screening;
- tax-information status;
- applicable competition rules acceptance.

These fields do not authorize collection until privacy purpose, retention,
vendor, and counsel requirements are approved.

## Casino evidence reservation

Future evaluation may require:

- identity and 21+ confirmation;
- precise, fresh geolocation in a licensed jurisdiction;
- AML and sanctions screening;
- self-exclusion and responsible-gaming checks;
- deposit/loss limits;
- source-of-funds review when triggered;
- casino-specific terms;
- license/market-access scope.

Casino approval must never be derived from Skill Prize approval.

## Base age hold

The permitted age for Monetaire Play and the treatment of minors are unresolved
legal/privacy/distribution decisions. Until an approved age policy exists, the
server must not infer that broad availability includes minors. Unknown or
ineligible age status fails closed for gameplay and purchase actions according
to the configured policy.

## Revocation

A new self-exclusion, account restriction, stale location, expired identity,
policy change, fraud review, sanctions event, or terms change can invalidate an
earlier decision. Revocation is append-only and immediately prevents creation
of new restricted sessions. Existing sessions follow the documented safety
termination policy; no cached approval may outlive its evidence.

## Authorization use

An approved eligibility record is only one input. Every restricted request also
needs the current jurisdiction decision, server feature gate, account status,
self-exclusion result, location evidence, and rules acceptance.
