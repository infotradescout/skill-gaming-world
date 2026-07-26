# Currency isolation

## Ledger types

| Ledger type | Unit | Initial state | Permitted direction |
| --- | --- | --- | --- |
| `PLAY_COIN` | Integer Play Coin units | Noncash use; sandbox acquisition only | Issuance and approved entertainment debit |
| `SKILL_PRIZE_USD` | Integer USD cents | Schema reservation; no active accounts or operations | None |
| `CASINO_CASH_USD` | Integer USD cents | Schema reservation; no active accounts or operations | None |

“Reserved” means the type can be named in policy and migration design. It does
not authorize account creation, funding, payment, payout, deposit, withdrawal,
or transfer.

## Forbidden graph

There is no edge in either direction between any two ledger types:

```text
PLAY_COIN       X       SKILL_PRIZE_USD
PLAY_COIN       X       CASINO_CASH_USD
SKILL_PRIZE_USD X       CASINO_CASH_USD
```

This also forbids indirect conversion through bonuses, refunds, coupon value,
merchandise, crypto, account transfer, support credit, or a common clearing
account.

## Technical enforcement

- No `balance` field exists on `User`.
- Ledger accounts have one immutable `ledgerType`.
- Transactions and all entries carry one identical `ledgerId`, `ledgerType`,
  and unit.
- A database constraint and domain invariant reject mixed-ledger transactions.
- There is no generic `transfer(source, destination, amount)` API.
- Commands are explicit (`grantEarnedPlayCoins`, `consumePlayCoinsForCosmetic`,
  `reversePlayCoinTransaction`) and accept no cash-ledger destination.
- Reserved cash command handlers and HTTP routes do not exist in the initial
  implementation.
- Feature gates provide defense in depth; they do not make a forbidden generic
  transfer safe.
- Reporting joins may read across ledger summaries but cannot write across
  them.

## Type separation

Do not alias Play Coin and money amounts to the same primitive at domain
boundaries. Use branded types and constructors that validate unit, sign, range,
and ledger:

```ts
type PlayCoinUnits = bigint & { readonly __brand: "PlayCoinUnits" };
type UsdCents = bigint & { readonly __brand: "UsdCents" };
```

Serializers must preserve integer precision. Floating-point values are forbidden
for balances, packages, entries, scores, and monetary placeholders.

## Proof obligations

Tests must attempt every pairwise cross-ledger direction, mismatched units,
forged ledger identifiers, direct repository writes, admin adjustments,
idempotent replays, and transaction rollback. Each must fail without a partial
entry. A schema reservation is not complete evidence unless direct-write
constraints are also tested.

