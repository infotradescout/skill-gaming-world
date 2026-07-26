# Prize contest lifecycle

This document specifies a reserved future lifecycle so the current design does
not make later contests mutable or unauditable. It does not activate prize
competitions.

```text
DRAFT -> LEGAL_REVIEW -> APPROVED -> COMMITTED -> OPEN
     -> CLOSED -> VERIFIED -> SETTLED -> ARCHIVED
              \-> CANCELLED
```

## Gate conditions

- `DRAFT`: no public visibility or entry.
- `LEGAL_REVIEW`: exact jurisdictions, consideration, prize source, age,
  official rules, tax/payment paths, and marketing are under review.
- `APPROVED`: all evidence references exist but entry is still impossible.
- `COMMITTED`: deal/rules/scoring/prize/funding/entry terms are immutable and
  fairness commitment is published.
- `OPEN`: separate server gates and current player eligibility allow entry.
- `CLOSED`: no new entries or gameplay starts.
- `VERIFIED`: results, fraud reviews, and appeals window satisfy published
  procedure.
- `SETTLED`: future authorized payout ledger records obligations/results.
- `ARCHIVED`: records retained under approved policy.
- `CANCELLED`: reason, authority, player notice, and financial procedure are
  appended; original contest remains.

No administrator can jump a state. Every transition uses a versioned command,
actor, reason, prerequisites, and audit event.

## Immutable publication package

Before `COMMITTED`, bind:

- sponsor/operator and official rules version;
- eligible jurisdictions and age;
- entry method and consideration analysis;
- fixed prize description/source and funding proof;
- deal, solver validation, ruleset, scoring, timer, and commitment;
- opening/closing/appeal schedule;
- cancellation, tie, fraud, correction, tax, and payout rules;
- required eligibility, terms, and provider versions.

Edits after commitment are forbidden. Material error means cancel and create a
new contest rather than silently changing the published one.

## Entry

An entry needs a fresh jurisdiction decision and approved
`SkillPrizeEligibility`. It never debits `PLAY_COIN`. Idempotency prevents
duplicate entry. One-person/one-entry limits, if used, must rely on
counsel-approved identity and duplicate-account controls.

## Results and settlement

Server-calculated scores use the published fairness contract. Fraud flags enter
review; they are not automatic proof. Appeals and score changes preserve
original records. Any future payout must post only in `SKILL_PRIZE_USD`, never
to casino cash or Play Coins, and remains under the separate payout gate.

