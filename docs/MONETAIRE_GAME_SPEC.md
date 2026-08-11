# Monetaire game specification

## Ruleset

The first ruleset is **Klondike Solitaire, Draw 3**. One stock action moves up
to three cards to the waste, with only the top waste card playable. Every ruleset has an
immutable identifier and semantic version. A game session stores the exact
ruleset version and deal identifier; “latest” is never resolved during play.

New play and publications use `KLONDIKE_DRAW_THREE_V2`, whose stored contract
records `draw: 3` and `MONETAIRE_COMPLETION_MOVES_ACTIVE_TIME_V1` scoring. The
mistaken sealed V1 record remains available only for historical verification and
cannot publish new competitions.

Ruleset data must define:

- 52-card deck encoding and canonical suit/rank order;
- deterministic shuffle algorithm and algorithm version;
- tableau construction, stock/waste behavior, foundation rules;
- legal move types and whether undo is available;
- completion condition, abandonment condition, and session expiry;
- scoring version and timer policy.

Ranked play must not offer paid hints, paid undo, time extensions, easier deals,
or any spending-based gameplay advantage. Practice-only conveniences must be
explicit and excluded from ranked scoring.

## Deterministic deal

The server selects a seed and runs the versioned shuffle algorithm over the
canonical deck. The persisted `Deal` records:

`dealId`, `seedCiphertext`, `rulesetVersion`, `shuffleVersion`,
`canonicalDealHash`, `dealCommitment`, `validationId`, and immutable timestamps.

The seed is not sent before a ranked competition closes. Entrants receive the
resulting deal state. Replaying the seed with the stored versions must reproduce
the same canonical deck.

Ranked deals come only from a curated library whose `DealValidation.status` is
`VERIFIED_SOLVABLE`. A validation record identifies the solver version,
ruleset, input hash, accepted-transition count, final event, transcript hash,
result, and database evidence timestamp. Configured publication runs that
mechanical replay before sampling its validation/publication time and leaves a
minimum five-second observable lead before entry opens. Logical transcript
coordinates are not represented as wall-clock validation time. The system must
not call an arbitrary deal solvable merely because it was generated.

## Session lifecycle

```text
CREATED -> ACTIVE -> COMPLETED
                  -> ABANDONED
                  -> EXPIRED
```

- The server creates the session and initial state.
- A session is bound to user, mode, competition (if any), deal, ruleset, and
  monotonic sequence.
- Practice sessions may resume from the last acknowledged event.
- Closing a browser does not pause a ranked timer.
- A ranked outage suspension is a server/admin event applied consistently and
  audibly; it is not client-controlled.
- Completion and abandonment are terminal. Corrections are separate adjustment
  records, never history edits.
- When a competition reaches its stored closing time, every unfinished entry
  session is terminalized as abandoned at that cutoff and receives a persisted
  incomplete score. A request arriving after the cutoff cannot resume or move
  that session.
- Competition publication, closure, evidence creation, reveal, and successor
  creation are serialized. Concurrent lifecycle requests converge on one
  closed event and at most one new configured competition.

## Configured account isolation

Two configured accounts entering the same competition receive the same pinned
deal, deal commitment, ruleset, generator, tableau, and stock. They receive
distinct competition entries and game sessions. Authentication and ownership checks
prevent either account from reading or mutating the other's session, while a
cross-account denial leaves the owner's state and sequence unchanged.

Every Stage 2 configured session-creating request passes through the Monetaire
Play jurisdiction authorizer. It records a fresh allow or deny decision. A new
successful competition entry stores the identifier of its allow decision, so
the entry can be traced to the exact request-specific eligibility evidence that
authorized it. Historical pre-Stage 2 entries retain any null link instead of
receiving invented evidence. A client location claim or an earlier entry cannot
substitute for a new decision.

## Move command

A command carries:

`gameSessionId`, `expectedSequence`, `idempotencyKey`, `priorStateHash`,
`moveType`, and typed move parameters.

The server:

1. authenticates and authorizes the user/session;
2. applies account, self-exclusion, and mode policy;
3. validates session state and expected sequence;
4. compares the prior state hash;
5. handles an exact idempotent retry by returning its stored accepted or
   rejected result;
6. rejects key reuse with a different payload;
7. validates the move using the pinned ruleset;
8. persists the accepted or rejected event and, for an accepted event, the next
   state in one transaction;
9. updates server timer/score projections;
10. returns the acknowledged sequence and state hash.

Illegal, duplicate, replayed, stale, and out-of-order commands do not advance
state. A rejected command does not consume the accepted sequence number, so a
corrected command with a new idempotency key may use that same expected
sequence. Repeating the rejected command with the same key and payload returns
the same rejection without creating a second outcome.

This exact stored-result contract applies to commands recorded by Stage 2.
Earlier rejected rows did not persist every rejection field; retrying one
returns its stored code with an explicit standardized legacy message rather
than claiming an unrecoverable original message or state.

## Account history and achievements

Configured player data is projected from persisted records scoped to the
authenticated account. History includes that account's session and
competition-entry identifiers, completed or incomplete score evidence,
verified duration, valid moves, accepted and rejected command counts, Play Coin
ledger entries, and achievements; the dashboard separately shows current
noncash rank. Queries join gameplay evidence back through the owned session;
another account's entry, moves, scores, ledger, rank, or achievement evidence
cannot appear in either projection.

Configured achievements are evidence-backed. In particular, `CLEAN_SEQUENCE`
requires a completed session with at least one persisted move and no persisted
rejection; its evidence identifies the authoritative session, score, and move
records. A completion by one account cannot award an achievement to another.

## Controls and accessibility

- Touch targets support mobile drag/tap without requiring precision dragging.
- Desktop supports pointer input.
- Keyboard controls expose focus, card selection, valid destinations, stock
  action, and cancellation where practical.
- State changes have text/ARIA feedback and do not rely on color alone.
- Legal move feedback explains the rule without revealing hidden information.
- Animation never determines whether a move was accepted.

## Timer

Ranked official duration is derived from server timestamps. It begins when the
server transitions the entry session to `ACTIVE` and ends on accepted
completion. Client wall clocks, animation time, device sleep, and request
payload duration are ignored. The first scoring version does not allow
user-controlled pauses in ranked play.

## Solver interface

```ts
interface DealSolver {
  validate(input: {
    canonicalDeck: readonly string[];
    rulesetVersion: string;
  }): Promise<{
    status: "VERIFIED_SOLVABLE" | "UNSOLVED" | "INDETERMINATE";
    solverVersion: string;
    evidenceHash: string;
  }>;
}
```

Only `VERIFIED_SOLVABLE` is eligible for ranked publication. `UNSOLVED` and
`INDETERMINATE` are excluded without being relabeled.
