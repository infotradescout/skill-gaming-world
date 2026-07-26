# Product boundaries

This is the short operational contract for deciding where a feature belongs.
See [Product architecture](PRODUCT_ARCHITECTURE.md) for the technical layout and
[Brand boundaries](BRAND_BOUNDARIES.md) for public language.

| Capability | `MONETAIRE_PLAY` | `MONETAIRE_PRIZE` | `SOCIAL_CASINO` | `REAL_MONEY_CASINO` |
| --- | --- | --- | --- | --- |
| Solitaire practice | Yes | Not independently | No | No |
| Noncash ranking | Yes | No | No | No |
| Buy/earn Play Coins | Sandbox purchase only initially | Never | Architecture only | Never |
| Cash or valuable prize | No | Future hold | No | Casino outcome only under future license |
| Paid entry | No | Future hold | No | Not a skill entry |
| Casino game execution | No | No | Future hold | Future hold |
| Deposit/withdrawal | No | Future prize payout only | No | Future hold |
| Required verification | Base account | Skill Prize | Base plus approved social policy | Casino |

Rules:

- A feature cannot silently move between modes.
- A shared navigation shell does not imply shared authorization.
- Play Coins cannot buy eligibility, entries, better deals, hints, time, or a
  valuable outcome.
- The Casino selector opens only the unavailable `CASINO_WORKING_TITLE` shell
  in the initial product.
- Any feature not represented in this matrix is denied until its owner, value
  model, policy inputs, audit behavior, and release authority are documented.

