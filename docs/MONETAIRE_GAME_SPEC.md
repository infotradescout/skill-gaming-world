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
`canonicalDealHash`, `commitment`, `validationId`, and immutable timestamps.

The seed is not sent before a ranked competition closes. Entrants receive the
resulting deal state. Replaying the seed with the stored versions must reproduce
the same canonical deck.

Ranked deals come only from a curated library whose `DealValidation.status` is
`VERIFIED_SOLVABLE`. A validation record identifies the solver version,
ruleset, input hash, result, and evidence timestamp. The system must not call an
arbitrary deal solvable merely because it was generated.

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

## Move command

A command carries:

`gameSessionId`, `expectedSequence`, `idempotencyKey`, `priorStateHash`,
`moveType`, and typed move parameters.

The server:

1. authenticates and authorizes the user/session;
2. applies account, self-exclusion, and mode policy;
3. validates session state and expected sequence;
4. compares the prior state hash;
5. handles an exact idempotent retry by returning its prior result;
6. rejects key reuse with a different payload;
7. validates the move using the pinned ruleset;
8. appends the event and next state in one transaction;
9. updates server timer/score projections;
10. returns the acknowledged sequence and state hash.

Illegal, duplicate, replayed, stale, and out-of-order commands do not advance
state.

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
