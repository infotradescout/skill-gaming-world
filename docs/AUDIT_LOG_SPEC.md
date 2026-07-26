# Audit log specification

## Scope

Audit events are immutable evidence for security, game, ledger, eligibility,
jurisdiction, responsible-play, admin, and policy decisions. Application logs
are diagnostic and do not replace the audit ledger.

## Event envelope

Every event includes:

- unique event id and schema version;
- event type and occurrence/record timestamps;
- actor type/id or system principal;
- subject/resource type/id;
- authenticated session and correlation/causation ids;
- environment and service;
- reason code and human reason where required;
- safe before/after hashes or redacted structured values;
- policy/rules/gate versions;
- outcome and failure code;
- previous event hash/sequence where the stream uses hash chaining.

Do not store passwords, tokens, full identity documents, payment credentials,
precise location, or unnecessary PII in an audit event. Store a protected
reference and safe classification instead.

## Required event classes

- login, logout, failed auth, session/device revocation;
- jurisdiction allow/deny for restricted state changes;
- gate publication, approval, emergency deny, and denied bypass;
- eligibility issue/expire/revoke/review;
- self-exclusion/cooldown create, expire, and override attempt;
- game session create/complete/abandon and fairness publication/reveal;
- score publication, appeal, fraud review, and adjustment;
- ledger post/reverse/adjust/reconcile mismatch;
- admin role grant/revoke, privileged read/export, command result;
- terms publication/acceptance;
- privacy request, data export/deletion disposition;
- security configuration and incident actions.

## Integrity and access

- Append only; application roles cannot update/delete.
- Database constraints prevent mutation, and backups preserve history.
- Sequence or hash chaining makes deletion/reordering detectable.
- Clock source and synchronization are monitored.
- Access is role-scoped and audited.
- Retention and legal holds are set by approved policy, not ad hoc cleanup.
- Exported evidence is signed/hashed with chain-of-custody metadata.

## Failure behavior

A privileged, ledger, score-correction, gate, eligibility, or self-exclusion
command fails closed if its required audit event cannot be committed atomically.
High-volume read telemetry may use separate logs, but sensitive admin reads must
remain auditable.

## Verification

Test mutation/deletion denial, sequence gaps, hash mismatch, transaction
rollback, redaction, unauthorized access, clock anomaly handling, export
integrity, and reconstruction of every manual balance/score change.

