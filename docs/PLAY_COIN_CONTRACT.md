# Play Coin contract

`PLAY_COIN` is a closed-loop entertainment unit for approved noncash product
experiences.

## Absolute properties

Play Coins:

- may be earned and may eventually be purchased;
- have no cash value;
- are not money, winnings, stored value, or a cash-equivalent claim;
- cannot be withdrawn, redeemed, transferred between users, sold, gifted,
  loaned, exchanged, or placed on a secondary market;
- cannot fund prize entry, a prize balance, casino cash, a casino wager, or a
  payout;
- cannot produce cash, gift cards, merchandise, cryptocurrency, discounts with
  transferable value, or anything else of real-world value;
- cannot improve a ranked deal, hints, undo, time, rules, or score;
- are recorded only in integer minor units.

No account-sale, inventory-sale, peer transfer, off-platform settlement, or
support workaround may recreate a transfer.

## Issuance

Every issuance uses an enumerated reason:

- `EARN_GAMEPLAY`
- `EARN_ACHIEVEMENT`
- `SANDBOX_PACKAGE`
- `PROMOTIONAL_GRANT_NONVALUE`
- `CUSTOMER_SERVICE_ADJUSTMENT`
- `REVERSAL`

A reason alone is insufficient: the ledger transaction also records the source
event/receipt, actor or system principal, policy version, idempotency key, and
audit correlation.

Production Play Coin sale remains on payment hold. A sandbox package receipt is
clearly marked simulated and cannot reference or invoke a live charge.

## Spending

Allowed debits must be enumerated and nonvaluable, for example a cosmetic or
social/practice-mode entertainment use approved by policy. Ranked competition
entry may use zero-cost admission but never a Play Coin debit.

The command layer must not accept an arbitrary destination, ledger type,
currency code, user, external address, or redemption method.

## History and corrections

The player sees date, amount, balance-after, reason, status, and support
reference for every entry. A balance is a projection of immutable entries, not
an editable user field.

An adjustment is a new balanced transaction. It never edits or deletes the
original. Administrators supply a reason and evidence; actor and before/after
state are audited.

## Public copy

Before any package action and in history/terms:

> Play Coins have no cash value and cannot be withdrawn, transferred, sold, or
> redeemed. They cannot be used to enter a prize competition or fund casino
> cash.

Do not label a package action “deposit,” a debit “bet,” or a balance “winnings.”

