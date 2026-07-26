# Payment hold points

## Status

Production payments, prize payments/payouts, and casino money movement are not
approved, implemented, or activated. Sandbox package simulation is not evidence
of merchant approval.

## Play Coin production-sale gate

Before considering `play_coin.package.production = ALLOW`, obtain:

- counsel approval of package design, disclosures, age/jurisdictions, refunds,
  tax, consumer-protection, and relationship to every game mode;
- payment provider underwriting for the exact business, product, merchant
  category, chargeback profile, and countries/states;
- app-store billing/distribution decision for each client;
- production secrets/account ownership and webhook/security review;
- approved package catalog, pricing, purchase limits, receipt, refund,
  chargeback, reconciliation, support, and incident procedures;
- evidence that grants can post only to `PLAY_COIN`;
- monitoring and emergency disable test.

## Prize and casino holds

Prize entry, prize payout, casino deposit, casino wager, and casino withdrawal
are separate operations with separate provider/regulatory evidence. None is
released by approving Play Coin sales.

Future financial architecture must identify product, jurisdiction, wallet, and
transaction purpose so restricted transactions can be controlled. Review the
official federal definitions and payment-system rule with counsel:

- [31 U.S.C. § 5362](https://uscode.house.gov/view.xhtml?req=%28title%3A31%20section%3A5362%20edition%3Aprelim%29)
- [31 C.F.R. Part 132](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-I/part-132)

These sources do not resolve state law, product classification, or provider
approval.

## Forbidden shortcuts

- switching sandbox keys to live;
- storing live credentials in preview;
- using Play Coin checkout to fund a prize or casino balance;
- relabeling deposits or payouts as packages/coins;
- manual payout outside the ledger;
- treating successful processor API calls as legal approval;
- enabling a provider before webhook/reconciliation/incident testing;
- using app-store in-app purchase for a prohibited real-money purpose.

## Kill switch

Production payment release, if later authorized, needs an independent
server-side emergency deny that stops new charge creation while preserving
webhook processing, refunds, reconciliation, and user support. Its exercise and
ownership must be evidenced before release.

