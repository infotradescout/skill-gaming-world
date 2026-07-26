# Data privacy

## Principle

Collect the minimum data needed for an approved purpose. Identity verification,
precise geolocation, sanctions/AML, payment, tax, and source-of-funds data are
future restricted-mode capabilities and must not be collected “just in case.”

This document is a design baseline, not a privacy-law conclusion or final
privacy notice.

## Data classes

| Class | Examples | Storage boundary |
| --- | --- | --- |
| Public | display name, opted-in ranking | Public projection only |
| Account | email, profile, auth/device metadata | Account store |
| Gameplay | deal/session/moves/scores | Game store |
| Financial-like internal | Play Coin ledger/history | Ledger store |
| Protective | cooldown, self-exclusion, limits | Restricted responsible-play store |
| Identity | DOB/age result, KYC evidence, sanctions/tax status | Separate identity vault/reference |
| Precise location | provider assertion/coordinates | Restricted evidence store; coarse decision elsewhere |
| Admin/audit | actor, reasons, before/after references | Append-only audit store |

Gameplay/marketing analytics must not receive raw identity documents, precise
location, payment credentials, self-exclusion details, or secret tokens.

## Purpose and minimization

Maintain a data inventory with field, purpose, lawful basis determined by
counsel, source, recipients, retention, deletion behavior, owner, and mode.
Before adding a field, answer:

1. Which approved operation needs it?
2. Can a derived status or provider token replace raw data?
3. Who needs access?
4. How long is it needed?
5. What happens on closure/deletion and legal hold?
6. Is it used for advertising, profiling, or a consequential decision?

Do not use gameplay loss patterns, self-exclusion, identity, or location to
target spending prompts.

## Identity vault

If verification is introduced:

- isolate raw documents and vendor responses from gameplay;
- encrypt with separately managed keys and rotate access;
- return minimal claims such as age/status/jurisdiction, not documents;
- log every privileged view/export;
- prevent Skill Prize evidence from automatically approving Casino;
- define provider deletion and incident obligations.

## Location

Request consent and explain why location is required. Store the minimum evidence
needed to prove a decision; ordinary logs use a reference and coarse
jurisdiction, not exact coordinates. Define freshness, spoof detection, retry,
denial, and deletion rules with the approved vendor and counsel.

## Age and minors

The base age policy is unresolved. Do not open the service to minors, build a
child-directed experience, or collect child data without an approved age-gate,
parental-consent analysis, distribution rating, retention policy, and counsel
review. Unknown age fails according to server policy.

## User controls

Provide an understandable privacy notice, consent controls where required,
account closure/deletion path, correction/access/export request path, and
contact method. Verify the requester without collecting excessive new data.
Deletion may preserve narrowly required audit, security, transaction, dispute,
tax, or regulatory records; counsel must define the basis and retention.

Apple's current guidelines require a privacy policy, purpose disclosure/data
minimization, consent for collection/use where applicable, and in-app account
deletion for apps supporting account creation. Distribution teams must verify
the current text before submission:
[Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

## Retention and vendors

Do not invent universal retention periods. Counsel and operations must approve
a schedule by record class, jurisdiction, dispute/tax/regulatory need, and
security risk. Automated deletion must respect legal holds and leave a safe
audit of disposition.

Each processor/provider requires due diligence, contract terms, purpose limits,
security/incident obligations, subprocessor disclosure, deletion/return,
location of processing, and access controls. Production data cannot enter
unapproved analytics, support, or test systems.

## Breach readiness

Maintain owner/contact inventory, data-flow diagrams, access logs, backup
coverage, credential rotation, forensic preservation, notification decision
procedure, user/regulator communication review, and exercises. Do not promise a
notification timeline until counsel maps applicable requirements.

