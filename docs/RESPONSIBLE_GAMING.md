# Responsible play and gaming

Monetaire Play is noncash, but user-protection controls begin now so later modes
cannot bypass them.

## Player controls

- Persistent session-time display based on server state.
- Optional reminders with configurable intervals and neutral copy.
- Account cooldown with clear start/end and blocked-action behavior.
- Self-exclusion by scope: `ALL_MODES`, `SKILL_GAMING`, or `CASINO`; initial UI
  must make the consequence explicit before confirmation.
- Account closure and data-rights request path.
- Clear Play Coin transaction history.
- Refund and support contact path.
- Package-limit placeholders that do not imply production purchase approval.

Do not use purchase countdowns, false scarcity, fake near wins, misleading cash
imagery, default-high packages, withdrawal language, or friction designed to
undo a protective choice.

## Self-exclusion state

```text
REQUESTED -> ACTIVE -> EXPIRED
                    -> PERMANENT
```

An active exclusion records scope, effective/expiry time, source, policy
version, and audit correlation. `ALL_MODES` blocks every game/session and
package command. Mode-specific scopes are evaluated server-side before new
sessions and value changes.

Ordinary support cannot shorten, remove, or bypass an exclusion. Any
counsel-approved reinstatement after an eligible expiry requires a distinct
workflow, waiting period, authorized role, reason, evidence, and append-only
event. A permanent exclusion has no ordinary reinstatement.

## Cooldown

A cooldown begins immediately after confirmation and blocks new sessions within
scope through its server expiry. It is not shortened because the user contacts
support, changes device, creates a new session, or changes location.

## Future regulated mode

Casino release would additionally require approved deposit/loss/time limits,
reality checks, self-exclusion registry integration, behavioral risk policy,
marketing suppression, source-of-funds escalation, intervention training,
complaint handling, and regulatory reporting. Placeholders do not satisfy those
requirements.

## Admin and telemetry

Protective controls are sensitive data. Only roles with a defined need can
access details; marketing cannot target or suppress offers based on vulnerable
behavior except as required to protect/exclude the user. Every view or override
attempt is audited.

Track control reliability, not user-shaming metrics: block enforcement,
cross-device propagation, support attempts, failed bypasses, and notification
delivery. Do not claim an intervention is effective without evidence.

