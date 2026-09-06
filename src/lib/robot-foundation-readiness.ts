/** Catalog-only checks remain safe when a required table is entirely absent. */
export const ROBOT_FOUNDATION_READY_SQL = `(
  NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('robot_combat_builds', 'id', 'uuid', true),
      ('robot_combat_builds', 'user_id', 'uuid', true),
      ('robot_combat_builds', 'build_key', 'character varying(64)', true),
      ('robot_combat_builds', 'display_name', 'character varying(80)', true),
      ('robot_combat_builds', 'latest_revision', 'integer', true),
      ('robot_combat_builds', 'created_at', 'timestamp with time zone', true),
      ('robot_combat_builds', 'updated_at', 'timestamp with time zone', true),
      ('robot_combat_build_revisions', 'id', 'uuid', true),
      ('robot_combat_build_revisions', 'build_id', 'uuid', true),
      ('robot_combat_build_revisions', 'user_id', 'uuid', true),
      ('robot_combat_build_revisions', 'revision', 'integer', true),
      ('robot_combat_build_revisions', 'blueprint_hash', 'character varying(64)', true),
      ('robot_combat_build_revisions', 'blueprint', 'jsonb', true),
      ('robot_combat_build_revisions', 'inspection', 'jsonb', true),
      ('robot_combat_build_revisions', 'created_at', 'timestamp with time zone', true),
      ('robot_combat_matches', 'id', 'uuid', true),
      ('robot_combat_matches', 'arena_key', 'character varying(96)', true),
      ('robot_combat_matches', 'ruleset_version', 'character varying(64)', true),
      ('robot_combat_matches', 'phase', 'robot_combat_match_phase', true),
      ('robot_combat_matches', 'player_a_id', 'uuid', true),
      ('robot_combat_matches', 'player_b_id', 'uuid', false),
      ('robot_combat_matches', 'state_snapshot', 'jsonb', true),
      ('robot_combat_matches', 'next_sequence', 'integer', true),
      ('robot_combat_matches', 'terminal_reason', 'character varying(96)', false),
      ('robot_combat_matches', 'started_at', 'timestamp with time zone', false),
      ('robot_combat_matches', 'completed_at', 'timestamp with time zone', false),
      ('robot_combat_matches', 'created_at', 'timestamp with time zone', true),
      ('robot_combat_matches', 'updated_at', 'timestamp with time zone', true),
      ('robot_combat_match_events', 'id', 'uuid', true),
      ('robot_combat_match_events', 'match_id', 'uuid', true),
      ('robot_combat_match_events', 'sequence', 'integer', true),
      ('robot_combat_match_events', 'action_id', 'character varying(128)', true),
      ('robot_combat_match_events', 'player_id', 'uuid', false),
      ('robot_combat_match_events', 'command_type', 'character varying(48)', true),
      ('robot_combat_match_events', 'command_payload', 'jsonb', true),
      ('robot_combat_match_events', 'state_hash_before', 'character varying(64)', true),
      ('robot_combat_match_events', 'state_hash_after', 'character varying(64)', true),
      ('robot_combat_match_events', 'accepted', 'boolean', true),
      ('robot_combat_match_events', 'rejection_code', 'character varying(96)', false),
      ('robot_combat_match_events', 'created_at', 'timestamp with time zone', true)
    ) AS required(table_name, column_name, type_name, not_null)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute AS attribute
      JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
        AND relation.relname = required.table_name
        AND attribute.attname = required.column_name AND NOT attribute.attisdropped
        AND attribute.attnotnull = required.not_null
        AND pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = required.type_name
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('robot_combat_builds', 'robot_combat_builds_pkey', ARRAY['id']),
      ('robot_combat_builds', 'robot_combat_builds_user_key_unique', ARRAY['user_id', 'build_key']),
      ('robot_combat_build_revisions', 'robot_combat_build_revisions_pkey', ARRAY['id']),
      ('robot_combat_build_revisions', 'robot_combat_build_revisions_build_revision_unique', ARRAY['build_id', 'revision']),
      ('robot_combat_build_revisions', 'robot_combat_build_revisions_hash_unique', ARRAY['build_id', 'blueprint_hash']),
      ('robot_combat_matches', 'robot_combat_matches_pkey', ARRAY['id']),
      ('robot_combat_match_events', 'robot_combat_match_events_pkey', ARRAY['id']),
      ('robot_combat_match_events', 'robot_combat_match_events_match_sequence_unique', ARRAY['match_id', 'sequence']),
      ('robot_combat_match_events', 'robot_combat_match_events_match_action_unique', ARRAY['match_id', 'action_id'])
    ) AS required(table_name, index_name, columns)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_index AS index_record
      JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_record.indexrelid
      JOIN pg_catalog.pg_class AS relation ON relation.oid = index_record.indrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = required.table_name
        AND index_relation.relname = required.index_name
        AND index_record.indisunique AND index_record.indisvalid AND index_record.indisready
        AND index_record.indpred IS NULL AND index_record.indexprs IS NULL
        AND ARRAY(
          SELECT attribute.attname::text
          FROM unnest(index_record.indkey) WITH ORDINALITY AS key(attnum, position)
          JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
            AND attribute.attnum = key.attnum
          ORDER BY key.position
        ) = required.columns
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('robot_combat_builds', 'robot_combat_builds_revision_nonnegative', 'CHECK ((latest_revision >= 0))'),
      ('robot_combat_build_revisions', 'robot_combat_build_revisions_revision_positive', 'CHECK ((revision > 0))'),
      ('robot_combat_build_revisions', 'robot_combat_build_revisions_hash_sha256', 'CHECK (((blueprint_hash)::text ~ ''^[0-9a-f]{64}$''::text))'),
      ('robot_combat_matches', 'robot_combat_matches_sequence_positive', 'CHECK ((next_sequence > 0))'),
      ('robot_combat_matches', 'robot_combat_matches_players_distinct', 'CHECK (((player_b_id IS NULL) OR (player_a_id <> player_b_id)))'),
      ('robot_combat_match_events', 'robot_combat_match_events_sequence_positive', 'CHECK ((sequence > 0))'),
      ('robot_combat_match_events', 'robot_combat_match_events_hash_sha256', 'CHECK ((((state_hash_before)::text ~ ''^[0-9a-f]{64}$''::text) AND ((state_hash_after)::text ~ ''^[0-9a-f]{64}$''::text)))'),
      ('robot_combat_match_events', 'robot_combat_match_events_rejection_consistent', 'CHECK (((accepted AND (rejection_code IS NULL)) OR ((NOT accepted) AND (rejection_code IS NOT NULL) AND ((state_hash_after)::text = (state_hash_before)::text))))')
    ) AS required(table_name, constraint_name, definition)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS guard
      JOIN pg_catalog.pg_class AS relation ON relation.oid = guard.conrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = required.table_name
        AND guard.conname = required.constraint_name
        AND guard.contype = 'c' AND guard.convalidated
        AND regexp_replace(pg_catalog.pg_get_constraintdef(guard.oid), '[[:space:]]', '', 'g') =
            regexp_replace(required.definition, '[[:space:]]', '', 'g')
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('robot_combat_builds', 'robot_combat_builds_user_id_users_id_fk', 'user_id', 'users'),
      ('robot_combat_build_revisions', 'robot_combat_build_revisions_build_id_robot_combat_builds_id_fk', 'build_id', 'robot_combat_builds'),
      ('robot_combat_build_revisions', 'robot_combat_build_revisions_user_id_users_id_fk', 'user_id', 'users'),
      ('robot_combat_matches', 'robot_combat_matches_player_a_id_users_id_fk', 'player_a_id', 'users'),
      ('robot_combat_matches', 'robot_combat_matches_player_b_id_users_id_fk', 'player_b_id', 'users'),
      ('robot_combat_match_events', 'robot_combat_match_events_match_id_robot_combat_matches_id_fk', 'match_id', 'robot_combat_matches'),
      ('robot_combat_match_events', 'robot_combat_match_events_player_id_users_id_fk', 'player_id', 'users')
    ) AS required(table_name, constraint_name, column_name, target_table)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS guard
      JOIN pg_catalog.pg_class AS relation ON relation.oid = guard.conrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_class AS target ON target.oid = guard.confrelid
      JOIN pg_catalog.pg_namespace AS target_namespace ON target_namespace.oid = target.relnamespace
      JOIN pg_catalog.pg_attribute AS source_column ON source_column.attrelid = relation.oid
        AND source_column.attname = required.column_name
      JOIN pg_catalog.pg_attribute AS target_column ON target_column.attrelid = target.oid
        AND target_column.attname = 'id'
      WHERE namespace.nspname = 'public' AND relation.relname = required.table_name
        AND guard.conname = required.constraint_name AND guard.contype = 'f'
        AND guard.convalidated AND NOT guard.condeferrable
        AND guard.confdeltype = 'r' AND guard.confupdtype = 'a'
        AND target_namespace.nspname = 'public' AND target.relname = required.target_table
        AND guard.conkey = ARRAY[source_column.attnum]
        AND guard.confkey = ARRAY[target_column.attnum]
    )
  )
  AND (
    SELECT array_agg(label.enumlabel::text ORDER BY label.enumsortorder)
    FROM pg_catalog.pg_enum AS label
    JOIN pg_catalog.pg_type AS enum_type ON enum_type.oid = label.enumtypid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
    WHERE namespace.nspname = 'public' AND enum_type.typname = 'robot_combat_match_phase'
  ) = ARRAY['WAITING_FOR_OPPONENT', 'READY_CHECK', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DISCONNECTED']
)`;
