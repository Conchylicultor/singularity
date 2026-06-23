import type { DerivedRollupSpec } from "@plugins/database/plugins/derived-tables/core";
import { TASK_LATEST_CONVERSATION_TABLE } from "@plugins/database/plugins/derived-views/core";

// Trigger-maintained materialized rollup: the latest NON-system conversation per
// task. Source of truth = `listConversationsForDisplay` (kind <> 'system',
// newest-first, first-per-task). The `agent-launches` loader reads this rollup
// instead of re-deriving the per-task latest map from a full `conversations_v`
// scan on every recompute. See
// research/2026-06-23-global-agent-launches-incremental-materialization.md.
//
// COMPLETENESS — why `conversations`-only triggers suffice:
//   `conversation.attempt_id` is IMMUTABLE (UpdateConversationPatch has no
//   attemptId) and `attempt.task_id` is IMMUTABLE (attempts are only
//   inserted/deleted, never re-task_id'd). So there is NO reparenting path that
//   could move a conversation to a different task without a row write on
//   `conversations` itself. An attempt DELETE cascades to its conversations →
//   fires the conversation DELETE trigger. The boot reconcile is the safety net
//   regardless of this assumption (it rebuilds the whole rollup from source).
//
// The `c.id DESC` tie-break makes equal-`created_at` ties deterministic — a
// strict improvement over the old JS Map's arbitrary scan-order first-wins.

// `TASK_LATEST_CONVERSATION_TABLE` MUST appear literally on the CREATE TABLE
// line (the imperative-create-table-allowlisted check enforces this); it is
// interpolated below.
const createDdl = `
CREATE TABLE IF NOT EXISTS ${TASK_LATEST_CONVERSATION_TABLE} (
  task_id         text PRIMARY KEY,
  conversation_id text NOT NULL,
  title           text,
  status          text NOT NULL,
  created_at      timestamptz NOT NULL
);
`;

// One STATEMENT-level maintenance function, shared by all three triggers. It
// reads the appropriate transition table (new_rows / old_rows), resolves the
// affected attempt ids → distinct task ids, recomputes each affected task's
// latest non-system conversation, upserts it, and deletes the rollup row for any
// affected task whose last non-system conversation was just removed.
const functionDdl = `
CREATE OR REPLACE FUNCTION task_latest_conversation_maintain() RETURNS trigger AS $tlc$
DECLARE affected_attempt_ids text[];
BEGIN
  IF    TG_OP = 'DELETE' THEN SELECT array_agg(DISTINCT attempt_id) INTO affected_attempt_ids FROM old_rows;
  ELSIF TG_OP = 'INSERT' THEN SELECT array_agg(DISTINCT attempt_id) INTO affected_attempt_ids FROM new_rows;
  ELSE  SELECT array_agg(DISTINCT attempt_id) INTO affected_attempt_ids
          FROM (SELECT attempt_id FROM new_rows UNION SELECT attempt_id FROM old_rows) u;
  END IF;
  IF affected_attempt_ids IS NULL THEN RETURN NULL; END IF;

  WITH affected_tasks AS (
    SELECT DISTINCT a.task_id FROM attempts a WHERE a.id = ANY(affected_attempt_ids)
  ), latest AS (
    SELECT DISTINCT ON (a.task_id) a.task_id, c.id AS conversation_id, c.title, c.status, c.created_at
    FROM conversations c JOIN attempts a ON a.id = c.attempt_id
    WHERE a.task_id IN (SELECT task_id FROM affected_tasks) AND c.kind <> 'system'
    ORDER BY a.task_id, c.created_at DESC, c.id DESC
  ), upserted AS (
    INSERT INTO task_latest_conversation (task_id, conversation_id, title, status, created_at)
    SELECT * FROM latest
    ON CONFLICT (task_id) DO UPDATE SET
      conversation_id = EXCLUDED.conversation_id, title = EXCLUDED.title,
      status = EXCLUDED.status, created_at = EXCLUDED.created_at
    RETURNING task_id
  )
  DELETE FROM task_latest_conversation t
   WHERE t.task_id IN (SELECT task_id FROM affected_tasks)
     AND t.task_id NOT IN (SELECT task_id FROM latest);
  RETURN NULL;
END; $tlc$ LANGUAGE plpgsql;
`;

// Three STATEMENT-level triggers (i/u/d), each declaring the transition table(s)
// the function reads. DROP IF EXISTS + CREATE so it is idempotent across boots.
const triggerDdl = `
DROP TRIGGER IF EXISTS task_latest_conversation_i ON conversations;
DROP TRIGGER IF EXISTS task_latest_conversation_u ON conversations;
DROP TRIGGER IF EXISTS task_latest_conversation_d ON conversations;
CREATE TRIGGER task_latest_conversation_i AFTER INSERT ON conversations
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION task_latest_conversation_maintain();
CREATE TRIGGER task_latest_conversation_u AFTER UPDATE ON conversations
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION task_latest_conversation_maintain();
CREATE TRIGGER task_latest_conversation_d AFTER DELETE ON conversations
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION task_latest_conversation_maintain();
`;

// Idempotent full rebuild from source — heals any drift from downtime / bulk
// loads. Guarded with `to_regclass('public.conversations') IS NOT NULL` so a
// pre-migration fresh-DB boot no-ops instead of erroring (the next boot
// reconciles once the base tables exist).
const reconcileDdl = `
DO $tlc_reconcile$
BEGIN
  IF to_regclass('public.conversations') IS NOT NULL THEN
    WITH latest AS (
      SELECT DISTINCT ON (a.task_id) a.task_id, c.id AS conversation_id, c.title, c.status, c.created_at
      FROM conversations c JOIN attempts a ON a.id = c.attempt_id
      WHERE c.kind <> 'system'
      ORDER BY a.task_id, c.created_at DESC, c.id DESC
    ), upserted AS (
      INSERT INTO task_latest_conversation (task_id, conversation_id, title, status, created_at)
      SELECT * FROM latest
      ON CONFLICT (task_id) DO UPDATE SET
        conversation_id = EXCLUDED.conversation_id, title = EXCLUDED.title,
        status = EXCLUDED.status, created_at = EXCLUDED.created_at
      RETURNING task_id
    )
    DELETE FROM task_latest_conversation t
     WHERE t.task_id NOT IN (SELECT task_id FROM latest);
  END IF;
END
$tlc_reconcile$;
`;

export const taskLatestConversationSpec: DerivedRollupSpec = {
  table: TASK_LATEST_CONVERSATION_TABLE,
  createDdl,
  functionDdl,
  triggerDdl,
  reconcileDdl,
};
