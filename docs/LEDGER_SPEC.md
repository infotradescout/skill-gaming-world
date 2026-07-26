# Ledger specification

## Model

The ledger is append-only and double-entry. `LedgerEntry` is immutable after
commit. A ledger transaction contains at least two entries whose signed integer
amounts sum to zero within exactly one ledger and unit.

Core records:

- `Ledger`: immutable type, unit, status, policy version.
- `LedgerAccount`: ledger, owner class/id, purpose, status.
- `LedgerTransaction`: id, reason, source reference, idempotency key, actor,
  correlation id, created timestamp, reversal reference.
- `LedgerEntry`: transaction, account, signed integer amount, sequence.
- `LedgerBalanceProjection`: rebuildable cached balance; never canonical.

## Play Coin accounts

Purpose-specific system accounts keep issuance auditable:

- `PLAY_COIN_ISSUANCE`
- `PLAY_COIN_PLAYER`
- `PLAY_COIN_CONSUMPTION`
- `PLAY_COIN_REVERSAL`

Account names are bookkeeping semantics, not a representation that coins are
financial assets. A player account belongs to one user and cannot be addressed
as a transfer destination by another user.

## Posting invariants

In one database transaction:

1. validate the enumerated command and policy;
2. reserve the unique idempotency key;
3. lock affected accounts in stable order;
4. reject inactive, wrong-owner, wrong-ledger, wrong-unit, or overflow values;
5. reject negative player balance unless a documented policy explicitly allows
   it (initial policy does not);
6. append transaction and entries;
7. verify sum equals zero;
8. update/rebuild projection;
9. append the correlated audit event;
10. commit atomically.

An exact retry returns the original result. Reuse of the key with a different
canonical request hash is rejected.

## Reversal and correction

Never update or delete a posted entry. A reversal posts equal and opposite
entries and references the original transaction. Partial corrections reference
both the source and an approval reason. Ordinary support cannot post
adjustments.

Every manual adjustment captures:

`actor`, `role`, `reasonCode`, human reason, evidence reference, ticket,
`beforeBalance`, `delta`, `afterBalance`, time, and audit correlation.

## Read model

The player history is ordered by immutable transaction sequence and shows
pending/posted/reversed state without calling Play Coins cash. Finance auditors
can reconcile issuance, consumption, player balances, reversals, and projection
drift. Reconciliation cannot repair drift silently; it opens an incident and
uses a new correction transaction if approved.

## Reserved ledgers

`SKILL_PRIZE_USD` and `CASINO_CASH_USD` definitions must not share issuance
accounts, command handlers, controllers, provider adapters, or settlement jobs
with `PLAY_COIN`. No reserved cash ledger is activated by migration alone.

## Required tests

- balanced and unbalanced transactions;
- integer bounds and precision;
- concurrent debit race;
- insufficient balance;
- same-payload retry and conflicting replay;
- cross-user destination rejection;
- all cross-ledger/unit combinations;
- rollback before/after audit append;
- reversal immutability;
- admin attribution completeness;
- full projection rebuild equals recorded projection.
