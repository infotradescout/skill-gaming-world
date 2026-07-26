# Monetaire fairness contract

## Player promise

Every noncash ranked entrant receives the same immutable, preselected deal under
the same immutable rules. Spending does not affect the deck, validation, timer,
available moves, score, or rank.

## Publication protocol

Before a competition opens:

1. select one curated `VERIFIED_SOLVABLE` deal;
2. pin the ruleset, shuffle, and scoring versions;
3. create canonical bytes from the seed, deal, ruleset version, scoring
   version, and a secret reveal nonce;
4. store and publish the SHA-256 commitment;
5. freeze the deal and all competition-affecting rules.

After the competition closes, reveal the seed and nonce so the commitment and
deal can be independently recomputed. The reveal record is append-only.

The commitment proves consistency with the later reveal; it is not, by itself,
proof of legal approval, randomness certification, or independent audit.

The repository's executable ranked adapter is explicitly safe-demo only. It
creates random seed and reveal-nonce material once, encrypts that material with
a separately configured key before exposing the event, pins the deal, ruleset,
generator and scoring versions, and records hash-chained validation,
publication and activation events. A missing key or key rotation fails closed;
the adapter never silently republishes an active event. Production requires a
durable encrypted publication repository and key-management service.

## Server authority

- The server creates sessions and validates every move.
- Accepted move events are append-only, sequential, idempotent, and state-hash
  chained.
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

The public rules must disclose this tuple before entry.

## Immutability

After `PUBLISHED`, no operator can replace the deal, ruleset, timer policy,
scoring version, opening/closing basis, or eligibility terms. If the
competition cannot proceed as published, an authorized administrator may
cancel it with reason and audit evidence; the record remains visible.

Score corrections create a new `ScoreAdjustment`/audit event containing actor,
reason, evidence reference, prior score, new score, and timestamp. The original
score remains intact.

## Appeals

A player can submit an appeal against a published result. Each appeal records
the competition/entry, category, player statement, evidence references, status,
reviewer, decision reason, and timestamps. Reviewers cannot alter gameplay
events. A resulting correction uses the append-only adjustment process.

## Verification evidence

Release evidence must cover deterministic reproduction, same-deal assignment,
illegal/duplicate/replayed/out-of-order move rejection, client clock
independence, publication immutability, exact ties, correction auditability,
seed commitment/reveal, and solver evidence.

No public “independently audited,” “certified fair,” or “guaranteed solvable”
claim is permitted until evidence for that exact claim exists.
