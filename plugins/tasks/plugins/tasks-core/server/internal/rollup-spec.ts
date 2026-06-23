import type { DerivedRollupSpec } from "@plugins/database/plugins/derived-tables/core";
import {
  ATTEMPT_CONV_AGG_TABLE,
  ATTEMPT_PUSH_AGG_TABLE,
} from "@plugins/database/plugins/derived-views/core";

// Trigger-maintained materialized rollups for `attempts_v`'s two per-attempt
// aggregates. `attempts_v` is declared `bootCritical` (persisted), and the
// live-state runtime forces a persisted resource to ALWAYS FULL-recompute (no
// scoping) — so on every fire it re-ran the full view, whose two inline CTEs
// aggregated ALL `conversations` + ALL `pushes` from scratch. These rollups hold
// the SAME aggregated columns the CTEs produced; `attempts_v` now LEFT JOINs them
// instead, turning the full recompute into a flat join over two tiny pre-rolled
// tables. The view's status / active / finished_at logic is unchanged — only the
// SOURCE of has_conv / has_live_conv / max_ended_at and has_push / min_push_at
// moves from CTE to rollup table. A missing rollup row reads as NULL via the LEFT
// JOIN, exactly as a missing CTE group did (preserving pending / abandoned /
// active semantics for attempts with no conversations / pushes). See the
// agent-launches precedent (conversations/agents/server/internal/rollup-spec.ts)
// and plugins/database/plugins/derived-tables/CLAUDE.md.
//
// COMPLETENESS — why `conversations`-only / `pushes`-only triggers suffice:
//   `conversation.attempt_id` is IMMUTABLE (UpdateConversationPatch has no
//   attemptId) and `pushes.attempt_id` is never reparented (pushes are only
//   inserted, never moved between attempts). So there is NO reparenting path that
//   could move a row to a different attempt's aggregate without a row write on the
//   source table itself. An attempt DELETE cascades (FK onDelete: cascade) to its
//   conversations + pushes → fires the source-table DELETE triggers, which delete
//   the now-empty rollup rows. The boot reconcile is the safety net regardless of
//   this assumption (it rebuilds both rollups from source).

// ── attempt_conv_agg (mirrors the `conv_agg` CTE) ─────────────────────────────
// A row exists iff the attempt has ≥1 conversation (matching the CTE's
// `GROUP BY attempt_id` membership). `has_conv` is a constant `true` marker (like
// the view) — a missing row reads as NULL = "no conversation" after the LEFT JOIN.
//
// `ATTEMPT_CONV_AGG_TABLE` MUST appear literally on the CREATE TABLE line (the
// imperative-create-table-allowlisted check enforces this); it is interpolated.
const convCreateDdl = `
CREATE TABLE IF NOT EXISTS ${ATTEMPT_CONV_AGG_TABLE} (
  attempt_id    text PRIMARY KEY,
  has_conv      boolean     NOT NULL,
  has_live_conv boolean,
  max_ended_at  timestamptz
);
`;

// One STATEMENT-level maintenance function shared by all three triggers. It reads
// the transition table(s), resolves the affected attempt ids, recomputes each
// affected attempt's conversation aggregate straight off `conversations`, upserts
// it, and deletes the rollup row for any affected attempt that now has zero
// conversations.
const convFunctionDdl = `
CREATE OR REPLACE FUNCTION attempt_conv_agg_maintain() RETURNS trigger AS $aca$
DECLARE affected_attempt_ids text[];
BEGIN
  IF    TG_OP = 'DELETE' THEN SELECT array_agg(DISTINCT attempt_id) INTO affected_attempt_ids FROM old_rows;
  ELSIF TG_OP = 'INSERT' THEN SELECT array_agg(DISTINCT attempt_id) INTO affected_attempt_ids FROM new_rows;
  ELSE  SELECT array_agg(DISTINCT attempt_id) INTO affected_attempt_ids
          FROM (SELECT attempt_id FROM new_rows UNION SELECT attempt_id FROM old_rows) u;
  END IF;
  IF affected_attempt_ids IS NULL THEN RETURN NULL; END IF;

  WITH agg AS (
    SELECT c.attempt_id,
           true AS has_conv,
           bool_or(c.status NOT IN ('gone', 'done')) AS has_live_conv,
           max(c.ended_at) AS max_ended_at
    FROM conversations c
    WHERE c.attempt_id = ANY(affected_attempt_ids)
    GROUP BY c.attempt_id
  ), upserted AS (
    INSERT INTO attempt_conv_agg (attempt_id, has_conv, has_live_conv, max_ended_at)
    SELECT * FROM agg
    ON CONFLICT (attempt_id) DO UPDATE SET
      has_conv = EXCLUDED.has_conv, has_live_conv = EXCLUDED.has_live_conv,
      max_ended_at = EXCLUDED.max_ended_at
    RETURNING attempt_id
  )
  DELETE FROM attempt_conv_agg t
   WHERE t.attempt_id = ANY(affected_attempt_ids)
     AND t.attempt_id NOT IN (SELECT attempt_id FROM agg);
  RETURN NULL;
END; $aca$ LANGUAGE plpgsql;
`;

const convTriggerDdl = `
DROP TRIGGER IF EXISTS attempt_conv_agg_i ON conversations;
DROP TRIGGER IF EXISTS attempt_conv_agg_u ON conversations;
DROP TRIGGER IF EXISTS attempt_conv_agg_d ON conversations;
CREATE TRIGGER attempt_conv_agg_i AFTER INSERT ON conversations
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION attempt_conv_agg_maintain();
CREATE TRIGGER attempt_conv_agg_u AFTER UPDATE ON conversations
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION attempt_conv_agg_maintain();
CREATE TRIGGER attempt_conv_agg_d AFTER DELETE ON conversations
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION attempt_conv_agg_maintain();
`;

// Idempotent full rebuild from source — heals any drift from downtime / bulk
// loads. Guarded with `to_regclass('public.conversations') IS NOT NULL` so a
// pre-migration fresh-DB boot no-ops instead of erroring (the next boot
// reconciles once the base table exists).
const convReconcileDdl = `
DO $aca_reconcile$
BEGIN
  IF to_regclass('public.conversations') IS NOT NULL THEN
    WITH agg AS (
      SELECT c.attempt_id,
             true AS has_conv,
             bool_or(c.status NOT IN ('gone', 'done')) AS has_live_conv,
             max(c.ended_at) AS max_ended_at
      FROM conversations c
      GROUP BY c.attempt_id
    ), upserted AS (
      INSERT INTO attempt_conv_agg (attempt_id, has_conv, has_live_conv, max_ended_at)
      SELECT * FROM agg
      ON CONFLICT (attempt_id) DO UPDATE SET
        has_conv = EXCLUDED.has_conv, has_live_conv = EXCLUDED.has_live_conv,
        max_ended_at = EXCLUDED.max_ended_at
      RETURNING attempt_id
    )
    DELETE FROM attempt_conv_agg t
     WHERE t.attempt_id NOT IN (SELECT attempt_id FROM agg);
  END IF;
END
$aca_reconcile$;
`;

export const attemptConvAggSpec: DerivedRollupSpec = {
  table: ATTEMPT_CONV_AGG_TABLE,
  createDdl: convCreateDdl,
  functionDdl: convFunctionDdl,
  triggerDdl: convTriggerDdl,
  reconcileDdl: convReconcileDdl,
};

// ── attempt_push_agg (mirrors the `push_agg` CTE) ─────────────────────────────
// A row exists iff the attempt has ≥1 push. `has_push` is a constant `true`
// marker — a missing row reads as NULL = "no push" after the LEFT JOIN.
//
// `ATTEMPT_PUSH_AGG_TABLE` MUST appear literally on the CREATE TABLE line.
const pushCreateDdl = `
CREATE TABLE IF NOT EXISTS ${ATTEMPT_PUSH_AGG_TABLE} (
  attempt_id  text PRIMARY KEY,
  has_push    boolean     NOT NULL,
  min_push_at timestamptz
);
`;

const pushFunctionDdl = `
CREATE OR REPLACE FUNCTION attempt_push_agg_maintain() RETURNS trigger AS $apa$
DECLARE affected_attempt_ids text[];
BEGIN
  IF    TG_OP = 'DELETE' THEN SELECT array_agg(DISTINCT attempt_id) INTO affected_attempt_ids FROM old_rows;
  ELSIF TG_OP = 'INSERT' THEN SELECT array_agg(DISTINCT attempt_id) INTO affected_attempt_ids FROM new_rows;
  ELSE  SELECT array_agg(DISTINCT attempt_id) INTO affected_attempt_ids
          FROM (SELECT attempt_id FROM new_rows UNION SELECT attempt_id FROM old_rows) u;
  END IF;
  IF affected_attempt_ids IS NULL THEN RETURN NULL; END IF;

  WITH agg AS (
    SELECT p.attempt_id,
           true AS has_push,
           min(p.created_at) AS min_push_at
    FROM pushes p
    WHERE p.attempt_id = ANY(affected_attempt_ids)
    GROUP BY p.attempt_id
  ), upserted AS (
    INSERT INTO attempt_push_agg (attempt_id, has_push, min_push_at)
    SELECT * FROM agg
    ON CONFLICT (attempt_id) DO UPDATE SET
      has_push = EXCLUDED.has_push, min_push_at = EXCLUDED.min_push_at
    RETURNING attempt_id
  )
  DELETE FROM attempt_push_agg t
   WHERE t.attempt_id = ANY(affected_attempt_ids)
     AND t.attempt_id NOT IN (SELECT attempt_id FROM agg);
  RETURN NULL;
END; $apa$ LANGUAGE plpgsql;
`;

const pushTriggerDdl = `
DROP TRIGGER IF EXISTS attempt_push_agg_i ON pushes;
DROP TRIGGER IF EXISTS attempt_push_agg_u ON pushes;
DROP TRIGGER IF EXISTS attempt_push_agg_d ON pushes;
CREATE TRIGGER attempt_push_agg_i AFTER INSERT ON pushes
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION attempt_push_agg_maintain();
CREATE TRIGGER attempt_push_agg_u AFTER UPDATE ON pushes
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION attempt_push_agg_maintain();
CREATE TRIGGER attempt_push_agg_d AFTER DELETE ON pushes
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION attempt_push_agg_maintain();
`;

const pushReconcileDdl = `
DO $apa_reconcile$
BEGIN
  IF to_regclass('public.pushes') IS NOT NULL THEN
    WITH agg AS (
      SELECT p.attempt_id,
             true AS has_push,
             min(p.created_at) AS min_push_at
      FROM pushes p
      GROUP BY p.attempt_id
    ), upserted AS (
      INSERT INTO attempt_push_agg (attempt_id, has_push, min_push_at)
      SELECT * FROM agg
      ON CONFLICT (attempt_id) DO UPDATE SET
        has_push = EXCLUDED.has_push, min_push_at = EXCLUDED.min_push_at
      RETURNING attempt_id
    )
    DELETE FROM attempt_push_agg t
     WHERE t.attempt_id NOT IN (SELECT attempt_id FROM agg);
  END IF;
END
$apa_reconcile$;
`;

export const attemptPushAggSpec: DerivedRollupSpec = {
  table: ATTEMPT_PUSH_AGG_TABLE,
  createDdl: pushCreateDdl,
  functionDdl: pushFunctionDdl,
  triggerDdl: pushTriggerDdl,
  reconcileDdl: pushReconcileDdl,
};
