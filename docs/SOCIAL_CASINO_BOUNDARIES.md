# Social casino boundaries

## Status

`SOCIAL_CASINO` is disabled everywhere except for product architecture and an
unavailable `CASINO_WORKING_TITLE` shell. No simulated slot, blackjack,
roulette, video poker, or other casino game executes in the initial product.

## If later authorized

A social-casino mode would use only nonredeemable Play Coins:

- no cash value, redemption, withdrawal, resale, transfer, secondary market, or
  real-world prize;
- no redeemable companion/sweepstakes currency;
- no purchase-linked prize entry;
- no implication that simulated success predicts real-money success;
- no fake jackpots, near-win manipulation, misleading cash imagery, false
  scarcity, or dark-pattern package prompts;
- no account/inventory sale or indirect value conversion;
- clear history, limits, cooldown, self-exclusion, refunds/support, and age
  policy.

`PLAY_COIN` can be used only after counsel approves the precise game,
jurisdictions, age, package design, disclosures, distribution, and consumer
protection. Social-casino approval does not enable Prize or Real-Money Casino.

## Technical isolation

- Game definitions and sessions are mode-bound.
- Outcome commands can debit/credit only allowed `PLAY_COIN` system accounts.
- There is no prize, payout, deposit, cash wallet, transferable reward, or
  external-value fulfillment output.
- Social outcomes cannot create `SKILL_PRIZE_USD` or `CASINO_CASH_USD` entries.
- The server checks mode, location, age, restrictions, self-exclusion, and
  social-casino gate before session creation and every value-changing command.

## Hold evidence

Required before implementation or public marketing:

- counsel treatment of every proposed game and jurisdiction;
- approved age/minor policy and privacy impact assessment;
- app-store/web distribution and payment method approval;
- purchase/refund/chargeback, responsible-play, and customer-support design;
- RNG/outcome disclosure and consumer fairness review;
- security/fraud testing and data-retention plan;
- exact server gate packet and emergency deny procedure.

The absence of redemption does not, by itself, establish that a proposed social
casino product is lawful or acceptable to a platform/payment provider.

