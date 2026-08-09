# Monetaire fairness contract

## Player promise

Every noncash ranked entrant receives the same immutable, preselected deal under
the same immutable rules. Spending does not affect the deck, validation, timer,
available moves, score, or rank.

## Publication protocol

Before a competition opens:

1. select one curated `VERIFIED_SOLVABLE` deal;
2. pin the ruleset, shuffle, and scoring versions;
3. persist the configured deal commitment over the seed, ruleset, generator,
   and ordered deck;
4. separately freeze the scoring version and opening/closing window in the
   immutable competition contract;
5. publish the deal commitment and contract evidence before entry.

Configured publication uses the database clock and stores an opening at least
five seconds later. During that observable `PUBLISHED` lead window, the
commitment and validation evidence are readable but entry remains closed.

The safe-demo catalog has an additional outer publication protocol: it hashes
canonical seed, deal, ruleset, scoring, and secret reveal-nonce material. That
demo-only outer commitment and nonce are not represented as configured
evidence. Configured claims therefore refer to the persisted **deal
commitment** plus separately immutable scoring/window fields, never to a
nonexistent configured reveal nonce.

At the stored closing cutoff, unfinished sessions are terminalized and scored
as incomplete using that cutoff rather than a later request time. The server
then persists the canonical final leaderboard, closes the competition, reveals
and verifies the seed, and makes the terminal evidence available by competition
identifier. Only after that sequence may it publish the configured successor.
Concurrent lifecycle requests are serialized and converge on at most one
successor.

After the configured competition closes, reveal the seed so the deal commitment
and canonical deck can be independently recomputed. The safe-demo outer
protocol additionally reveals its nonce. Reveal records are append-only, and
no seed, nonce, or seed ciphertext is exposed before a terminal state.

A published commitment proves consistency with its later reveal; it is not, by itself,
proof of legal approval, randomness certification, or independent audit.

The safe-demo ranked catalog creates random seed and reveal-nonce material once,
encrypts it with a separately configured key, and records hash-chained
validation/publication events. Configured mode instead persists encrypted seed,
a mechanically replayed 81-transition solver transcript hash/final event/result,
immutable competition fields, closure, reveal, and final leaderboard evidence
in the database. Transcript event times are labeled logical proof coordinates;
validation and publication chronology uses PostgreSQL timestamps sampled after
replay. Missing configured key material fails closed; neither path silently
substitutes the other protocol.

## Server authority

- The server creates sessions and validates every move.
- Stage 2 accepted and rejected move outcomes are persisted completely. Exact
  retries reproduce the stored outcome; only accepted events advance the
  sequential, state-hash-chained game state. A pre-Stage 2 rejected event may
  contain only its command and rejection code, so its historical retry uses a
  standardized legacy message rather than inventing missing evidence.
- Rejected commands do not consume an accepted sequence number, so a corrected
  command with a new idempotency key may proceed at the same expected sequence.
- Client clocks and client-computed scores are informational only.
- The official timer uses server time under the pinned timer policy.
- No hidden bot is presented as human.
- Spending and account history never change deal difficulty or ranking rules.
- Fraud flags are review inputs, not proof and not automatic forfeiture.

## Scoring version 1

1. Completed entries rank ahead of incomplete entries.
2. Completed entries sort by fewest accepted valid moves.
3. If move counts match, lower verified server duration ranks first.
4. If both match, entries share the same rank.
5. Incomplete entries share an incomplete status after completed entries; no
   undisclosed progress heuristic breaks their tie.
6. No random, spending-based, signup-time, or admin-chosen tiebreaker exists.

Abandonment and competition closure both persist an incomplete score for an
unfinished entry. Different move counts or durations do not separate incomplete
entries; they retain the same incomplete rank. The public rules must disclose
this tuple before entry.

## Immutability

After `PUBLISHED`, no operator can replace the deal, ruleset, timer policy,
scoring version, opening/closing basis, or eligibility terms. If the
competition cannot proceed as published, an authorized administrator may
cancel it with reason and audit evidence; the record remains visible.

Score corrections create a new `ScoreAdjustment`/audit event containing actor,
reason, evidence reference, prior score, new score, and timestamp. The original
score remains intact.

Closure creates one canonical final leaderboard snapshot for the competition.
Its SHA-256 hash covers canonical competition, scoring-version, and standing
references. Database constraints permit only one snapshot per competition,
validate the hash shape, and reject update or deletion, so later reads cannot
silently replace the published result.

## Eligibility and player separation

Every Stage 2 configured practice or noncash-entry request records a
request-specific Monetaire Play jurisdiction decision. Each new successful
competition entry links the allowing decision that authorized it. Historical
pre-Stage 2 entries may retain a null link rather than fabricating authorization
evidence that was never recorded. The decision is evidence for this noncash
operation only; it grants no prize, payment, payout, redemption, Social Casino,
or real-money casino authority.

Entrants in one competition share its pinned deal contract, not gameplay state.
Each account owns a distinct entry and session. Session reads, move submission,
history, rank, score, ledger, and achievement projections enforce that ownership
boundary.

## Appeals

A player can submit an appeal against a published result. Each appeal records
the competition/entry, category, player statement, evidence references, status,
reviewer, decision reason, and timestamps. Reviewers cannot alter gameplay
events. A resulting correction uses the append-only adjustment process.

## Verification evidence

Release evidence must cover deterministic reproduction, same-deal assignment,
illegal/duplicate/replayed/out-of-order move rejection, exact accepted and
rejected retry replay, corrected same-sequence play after a rejection,
cross-account denial without state mutation, account-isolated history and
achievements, client clock independence, publication immutability, completed
and incomplete ties, correction auditability, seed commitment/reveal,
single-successor lifecycle convergence, and solver evidence.

The configured two-account hosted proof must run against an isolated preview
and database branch, never the production origin. It uses ordinary accounts to
verify one shared V2 deal, distinct entry/session ownership, retry semantics,
one completed and one incomplete result, and live leaderboard projection. The
separate database-backed lifecycle proof covers cutoff terminalization,
immutable final snapshot hashing, post-close reveal verification, historical
contract projection, and single-successor convergence.

No public “independently audited,” “certified fair,” or “guaranteed solvable”
claim is permitted until evidence for that exact claim exists.

This fairness work does not authorize search indexing. Preview noindex controls
and the public-discovery hold remain in force until a permanent domain and a
separate discovery release are approved.
