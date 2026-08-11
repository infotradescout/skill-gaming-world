# Stage 2 Production Cutover

Migration `0009_monetaire_two_account_reality.sql` changes write invariants and
repairs historical configured records. It must not run as an ordinary rolling
pre-deploy migration while a Stage 1 application instance can still write. The
old binary could create evidence that Stage 2 no longer permits after the
one-time repair has finished.

Keep prizes, payments, payouts, redemption, Social Casino, real-money casino,
and public discovery disabled throughout this procedure.

## Release prerequisites

- Freeze one reviewed commit and prove that exact commit on an isolated
  database branch with the configured desktop and mobile two-account suite.
- Record the production service ID, deployed commit, Neon branch and endpoint,
  database name, and database fingerprint.
- Create and retain a point-in-time production database branch before any
  migration write.
- Require tests, typecheck, lint, configured production build, dependency
  audit, migration check, Playwright discovery, and diff check to pass from the
  frozen checkout.

## Read-only database preflight

Run the checks below before maintenance begins, then repeat them after traffic
is blocked and transactions are drained. Unless a query states a different
acceptance rule, it must return zero rows or a zero count. Do not repair or
invent evidence to make a query pass.

### Cutoff, snapshot, and validation truth

```sql
SELECT count(DISTINCT session.id) AS late_ranked_session_count
FROM public.game_sessions AS session
JOIN public.competition_entries AS entry
  ON entry.id = session.competition_entry_id
JOIN public.competitions AS competition
  ON competition.id = entry.competition_id
WHERE EXISTS (
  SELECT 1 FROM public.move_events AS move
  WHERE move.game_session_id = session.id
    AND move.accepted = true
    AND move.server_received_at >= competition.closes_at
) OR (
  session.status IN ('COMPLETED', 'ABANDONED')
  AND (
    session.last_active_at >= competition.closes_at
    OR session.completed_at >= competition.closes_at
    OR session.abandoned_at >= competition.closes_at
    OR (
      session.activity_clock_snapshot ->> 'status' = 'FINALIZED'
      AND session.activity_clock_snapshot ->> 'lastServerEventMs' ~ '^[0-9]+$'
      AND pg_catalog.to_timestamp(
        (session.activity_clock_snapshot ->> 'lastServerEventMs')::numeric / 1000
      ) >= competition.closes_at
    )
  )
) OR EXISTS (
  SELECT 1 FROM public.scores AS score
  WHERE score.game_session_id = session.id
    AND score.computed_at >= competition.closes_at
);

SELECT count(*) AS preexisting_snapshot_count
FROM public.leaderboard_snapshots;

SELECT deal_id, count(*)
FROM public.deal_validations
WHERE status = 'VERIFIED_SOLVABLE'
GROUP BY deal_id
HAVING count(*) > 1;
```

Stage 1 never produced an authenticated canonical leaderboard snapshot, so any
preexisting snapshot stops the release.

### Eligibility and session compatibility

Every result below stops the cutover. Historical null eligibility links remain
allowed and must not receive fabricated decisions.

```sql
SELECT eligibility_decision_id, count(*)
FROM public.competition_entries
WHERE eligibility_decision_id IS NOT NULL
GROUP BY eligibility_decision_id
HAVING count(*) > 1;

SELECT competition_entry_id, count(*)
FROM public.game_sessions
WHERE competition_entry_id IS NOT NULL
GROUP BY competition_entry_id
HAVING count(*) > 1;

SELECT id, session_mode, competition_entry_id
FROM public.game_sessions
WHERE NOT (
  (session_mode = 'PRACTICE' AND competition_entry_id IS NULL)
  OR (
    session_mode = 'NONCASH_COMPETITION'
    AND competition_entry_id IS NOT NULL
  )
);

SELECT entry.id, entry.user_id, entry.eligibility_decision_id
FROM public.competition_entries AS entry
WHERE entry.eligibility_decision_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.jurisdiction_decisions AS decision
    WHERE decision.id = entry.eligibility_decision_id
      AND decision.user_id = entry.user_id
      AND decision.product_mode = 'MONETAIRE_PLAY'
      AND decision.decision = 'ALLOW'
  );

SELECT session.id
FROM public.game_sessions AS session
WHERE session.status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM public.scores AS score
    WHERE score.game_session_id = session.id
      AND score.superseded_by_score_id IS NULL
  );
```

### Abandonment backfill

Malformed scoreless abandonment cannot be reconstructed and stops the release.
The first predicate intentionally mirrors migration `0009`.

```sql
SELECT session.id
FROM public.game_sessions AS session
JOIN public.ruleset_versions AS ruleset
  ON ruleset.id = session.ruleset_version_id
WHERE session.status = 'ABANDONED'
  AND NOT EXISTS (
    SELECT 1 FROM public.scores AS score
    WHERE score.game_session_id = session.id
      AND score.superseded_by_score_id IS NULL
  )
  AND (
    session.state_snapshot ->> 'status' = 'ABANDONED'
    AND session.activity_clock_snapshot ->> 'status' = 'FINALIZED'
    AND session.state_snapshot ->> 'validMoveCount' ~ '^[0-9]+$'
    AND (session.state_snapshot ->> 'validMoveCount')::numeric <= 2147483647
    AND session.activity_clock_snapshot ->> 'accumulatedActiveMs' ~ '^[0-9]+$'
    AND (session.activity_clock_snapshot ->> 'accumulatedActiveMs')::numeric <= 9223372036854775807
    AND session.activity_clock_snapshot ->> 'lastServerEventMs' ~ '^[0-9]+$'
    AND pg_catalog.jsonb_typeof(ruleset.scoring -> 'version') = 'string'
    AND pg_catalog.length(ruleset.scoring ->> 'version') BETWEEN 1 AND 64
  ) IS NOT TRUE;

SELECT
  session.id,
  session.state_snapshot ->> 'validMoveCount' AS valid_move_count,
  session.activity_clock_snapshot ->> 'accumulatedActiveMs' AS active_ms,
  session.activity_clock_snapshot ->> 'lastServerEventMs' AS computed_at_ms,
  ruleset.scoring ->> 'version' AS scoring_version
FROM public.game_sessions AS session
JOIN public.ruleset_versions AS ruleset
  ON ruleset.id = session.ruleset_version_id
WHERE session.status = 'ABANDONED'
  AND NOT EXISTS (
    SELECT 1 FROM public.scores AS score
    WHERE score.game_session_id = session.id
      AND score.superseded_by_score_id IS NULL
  )
ORDER BY session.id;
```

The second query may be nonempty. Record its exact IDs and values as the
expected deterministic backfill and reconcile every row after migration.

### Metadata-only V2 head

```sql
SELECT competition.id, competition.status, count(entry.id) AS entry_count
FROM public.competitions AS competition
JOIN public.ruleset_versions AS ruleset
  ON ruleset.id = competition.ruleset_version_id
JOIN public.game_definitions AS definition
  ON definition.id = ruleset.game_definition_id
LEFT JOIN public.competition_entries AS entry
  ON entry.competition_id = competition.id
WHERE definition.key = 'MONETAIRE_SOLITAIRE'
  AND ruleset.version = 'KLONDIKE_DRAW_THREE_V2'
  AND competition.status IN ('PUBLISHED', 'OPEN')
  AND NOT EXISTS (
    SELECT 1 FROM public.deal_validations AS validation
    WHERE validation.deal_id = competition.deal_id
      AND validation.status = 'VERIFIED_SOLVABLE'
      AND validation.evidence ->> 'protocol' =
        'CURATED_SOLVABLE_REPLAY_V1'
  )
GROUP BY competition.id, competition.status;
```

Zero rows is valid. Exactly one row is valid only when `entry_count = 0`;
`0009` will cancel that metadata-only Stage 1 head. More than one row, or any
entered row, stops the cutover.

### Complete audit graph

```sql
WITH RECURSIVE audit_walk AS (
  SELECT
    event.event_hash,
    ARRAY[event.event_hash]::text[] AS visited
  FROM public.audit_events AS event
  WHERE event.previous_event_hash IS NULL

  UNION ALL

  SELECT
    child.event_hash,
    audit_walk.visited || child.event_hash
  FROM audit_walk
  JOIN public.audit_events AS child
    ON child.previous_event_hash = audit_walk.event_hash
  WHERE NOT child.event_hash = ANY(audit_walk.visited)
), audit_shape AS (
  SELECT
    count(*) AS event_count,
    count(*) FILTER (WHERE event.previous_event_hash IS NULL) AS root_count,
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM public.audit_events AS child
        WHERE child.previous_event_hash = event.event_hash
      )
    ) AS head_count,
    count(*) FILTER (
      WHERE event.previous_event_hash IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.audit_events AS parent
          WHERE parent.event_hash = event.previous_event_hash
        )
    ) AS dangling_parent_count,
    (
      SELECT count(*) FROM (
        SELECT previous_event_hash
        FROM public.audit_events
        WHERE previous_event_hash IS NOT NULL
        GROUP BY previous_event_hash
        HAVING count(*) > 1
      ) AS fork
    ) AS fork_count,
    (SELECT count(*) FROM audit_walk) AS reachable_count
  FROM public.audit_events AS event
)
SELECT * FROM audit_shape;
```

An empty history has zero for every field. A valid nonempty history has one
root, one head, no dangling parents, no forks, and `reachable_count =
event_count`. This rejects a valid chain accompanied by a disconnected cycle.

Migration `0009` repeats the cutoff, snapshot, validation, eligibility,
session/cardinality, terminal-score, malformed-abandonment, and proofless-head
checks before its first repair write. It aborts before changing indexes or
triggers if any precondition fails.

## Target and journal verification

Immediately before migration:

- derive the configured database fingerprint from the exact `DATABASE_URL`
  using the repository helper and match the recorded production Neon branch,
  endpoint, and database name;
- require production `CONFIGURED_E2E_TARGET_ID` to be unset. It is preview-only,
  so production health must expose
  `verificationTarget: { id: null, databaseFingerprint: null }`;
- compute SHA-256 for every frozen migration file. Drizzle hashes the exact SQL
  bytes. Query the journal and require exactly the frozen `0000`–`0008` hashes,
  with `0009` absent:

```sql
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at, id;
```

After migration, require exactly ten rows and require the final row's hash and
`created_at` to match the frozen `0009` file and journal entry. A count of ten
without an exact hash match is not sufficient.

## Traffic-stopped migration

1. Disable automatic deployment. Enable Render maintenance mode, which serves
   a non-forwarding maintenance response while still permitting deployment.
   Do not suspend the service: Render rejects deploy triggers for suspended
   services. Stop workers, one-off jobs, and every external writer separately.
2. Prove the old application cannot accept registration, session, entry, move,
   restriction, appeal, or account-close requests. Stop until this query
   returns zero rows other than the operator backend:

```sql
SELECT pid, application_name, state, xact_start, query_start
FROM pg_catalog.pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND backend_type = 'client backend'
  AND xact_start IS NOT NULL;
```

3. Re-run every preflight, target, and journal check. Create the final Neon
   backup branch and retain the expected abandonment-backfill set.
4. From the frozen Stage 2 commit, run `npm run db:migrate` once against the
   verified production branch. If it fails, keep maintenance mode enabled and
   investigate; never bypass a guard or restart Stage 1 on the migrated branch.
5. Deploy the same frozen SHA while maintenance mode remains enabled. Render's
   `preDeployCommand` may observe the already-applied journal row, but it does
   not provide the write freeze. Wait for the new deploy and Render health
   check to become Live.
6. While maintenance remains enabled, run database postchecks, reconcile every
   expected abandonment backfill, and reverify the exact journal hash.
7. Disable maintenance only after all stop conditions pass. If the first
   external health or feature-gate check fails, immediately re-enable it.

## Post-cutover proof

- Require `/api/health` to return HTTP 200 with configured environment and
  database/schema/jurisdiction/preview-owner readiness. Production's preview
  target remains null; database identity remains an out-of-band operator check.
- Inspect Render configuration and require every prize, payment, payout,
  redemption, Social Casino, and real-money environment request false. Also
  require `/api/feature-gates` to report every `environmentRequests` value false
  and every cash/prize/casino gate `DENY`; health's hardcoded operation fields
  are not sufficient evidence of environment configuration.
- Require exact journal/hash convergence, zero active superseded V1
  competitions, zero active proofless V2 competitions, zero terminal sessions
  without an active score, the complete audit proof above, and all Stage 2
  database invariants.
- Verify a metadata-only V2 head was cancelled only if its preflight entry count
  was zero.
- Explicitly authorize one controlled `GET /api/competitions` lifecycle call.
  It is write-capable and may close, reveal, snapshot, publish, or open a
  competition. Record its before/after database evidence and verify any newly
  published successor has the persisted 81-transition replay proof.
- Limit remaining production smoke checks to genuinely non-mutating paths.
  Never point the hosted two-account mutation suite at production.

If a postcheck fails, re-enable maintenance mode and preserve the failed
database for diagnosis. Prefer a forward repair from the reviewed commit.
Restoring the backup requires an explicit database cutover decision; never run
the Stage 1 binary against a Stage 2-migrated database.
