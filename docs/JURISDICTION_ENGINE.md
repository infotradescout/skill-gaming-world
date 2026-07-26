# Jurisdiction engine

## Purpose

The jurisdiction engine returns a versioned server decision for one user,
operation, product mode, and request context. It does not declare a product
“legal.” It enforces a counsel-approved feature matrix.

## Required inputs

- product mode and exact operation;
- authenticated user and account status;
- identity and age status;
- trusted current physical-location evidence and freshness;
- declared residence;
- jurisdiction rule/version;
- separate Skill Prize and Casino eligibility;
- account restrictions and self-exclusion scope;
- server feature-gate state;
- applicable terms/rules acceptance.

A client-provided state/country, IP header, profile address, or selected locale
is not proof of physical location.

## Decision record

Persist:

`decisionId`, `userId`, `mode`, `operation`, `outcome`, ordered reason codes,
`jurisdictionRuleId/version`, gate snapshot, eligibility references, restriction
references, location evidence class/provider reference/freshness, terms
versions, request correlation, decided/expiry time.

Do not put raw identity documents or exact coordinates in ordinary audit logs.

## Evaluation order

1. Reject unknown mode/operation.
2. Verify authentication and account status.
3. Apply cooldown/self-exclusion/restrictions.
4. Require age/identity status for the operation.
5. Validate trusted location evidence and freshness.
6. Resolve residence and physical-jurisdiction policy.
7. Require the mode-specific independent eligibility.
8. Require current terms/rules acceptance.
9. Require the operation and mode feature gates.
10. return `ALLOW` only if every required input allows.

Reasons accumulate for operator diagnosis, but user errors reveal only safe,
actionable information.

## Initial configuration

- `MONETAIRE_PLAY`: allow only jurisdictions explicitly configured for the
  approved Play feature set.
- `MONETAIRE_PRIZE`: deny everywhere.
- `SOCIAL_CASINO`: deny everywhere.
- `REAL_MONEY_CASINO`: deny everywhere.

Empty configuration, unknown geography, stale evidence, rule-version mismatch,
provider failure, conflicting residence/location, or cache failure means deny.

## API contract

```ts
type JurisdictionOutcome = "ALLOW" | "DENY";

interface JurisdictionDecisionService {
  decide(input: RestrictedOperationContext): Promise<{
    decisionId: string;
    outcome: JurisdictionOutcome;
    reasons: readonly string[];
    policyVersion: string;
    expiresAt: Date;
  }>;
}
```

Callers must supply the returned `decisionId` to the state-changing command.
The command verifies that decision matches user, operation, mode, request
context, and freshness. A decision cannot be reused across operations.

## Rule changes

Rules are immutable versions with effective windows and approval references.
Publishing a new rule never edits the old version. Emergency disablement is a
global server deny with actor, reason, scope, and audit event.

## Test matrix

Test allow, deny, and unknown for every input; stale and conflicting location;
client spoofing; cache staleness; direct endpoint calls; eligibility cross-use;
terms mismatch; self-exclusion; gate changes; provider timeout; and policy
version rollover.
