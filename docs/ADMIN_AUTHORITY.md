# Admin authority

## Roles

| Role | Allowed purpose | Explicitly not allowed |
| --- | --- | --- |
| `SUPPORT` | View limited account/support context; open cases | Balances, scores, gates, exclusions |
| `FRAUD_REVIEW` | Review flags and evidence; recommend outcome | Silent forfeiture or score edit |
| `CONTENT_ADMIN` | Manage approved copy/content and draft competitions | Publish cash modes or active rules |
| `FINANCE_AUDITOR` | Read/reconcile ledger and adjustments | Post entries or enable payments |
| `COMPLIANCE_ADMIN` | Version jurisdiction rules; review eligibility/restrictions | Unilateral cash-mode activation |
| `SUPER_ADMIN` | Emergency and narrowly defined privileged operations | Bypass audit, history, dual control, or legal holds |

`SUPER_ADMIN` is not omnipotence. Authorization is per command and environment.

## Universal prohibitions

No administrator may silently:

- modify a balance or score;
- edit/delete a ledger, move, game, financial, audit, or fairness record;
- replace a published/active deal or ruleset;
- remove self-exclusion through ordinary support;
- activate cash/prize/casino operations;
- impersonate a player to create accepted gameplay;
- erase fraud review or appeal history.

## Privileged command envelope

Every action records:

`actorUserId`, active role/grant, session/MFA context, exact command, target,
reason code and explanation, ticket/evidence reference, before/after state,
timestamp, IP/device security metadata, approval references, result, and audit
correlation.

Balance and score corrections append a reversal/adjustment; originals remain.
Published competition cancellation preserves the publication record.

## Separation and dual control

Gate activation, jurisdiction publication, identity/eligibility override,
self-exclusion exception (if counsel ever permits one), large/manual
adjustments, and future prize/casino operations require separate requester and
approver roles. The same principal cannot satisfy both.

Cash mode activation additionally requires evidence-backed compliance release
outside ordinary admin UI. Initial code must have no callable cash operation to
activate.

## Sessions and access

- Admin authentication requires stronger controls and short sessions.
- Production access is least privilege, time-bounded where possible, and
  periodically reviewed.
- Shared accounts are forbidden.
- Sensitive fields are masked by default.
- Break-glass use has a documented incident, bounded duration, alert, and
  retrospective review.

## Review

Role grants, privileged actions, denied attempts, adjustment volume, gate
changes, exports, and sensitive-record views receive periodic independent
review. Review findings create new records; they do not rewrite history.

