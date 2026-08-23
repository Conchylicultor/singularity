import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import type { BootBenchRunBody } from "../../shared/endpoints";

// `conversations.id` and `attempts.id` are both `text`.
const IdRowSchema = z.object({ id: z.string() });

export interface ResolvedFixtures {
  conversationId: string | null;
  attemptId: string | null;
}

// Deterministic fixture resolution for the benchmark targets. Request ids win
// (so a before/after pair can pin the exact same fixtures); otherwise pick by raw
// SQL on `db` — no cross-plugin table imports (the conversations/attempts/pushes
// tables are tasks-core-private), matching boot-snapshot's no-cross-table-import
// approach. Returns nulls when nothing matches; the caller skips those targets.
export async function resolveFixtures(
  req: BootBenchRunBody,
): Promise<ResolvedFixtures> {
  const conversationId =
    req.conversationId ?? (await newestLiveConversationId());
  const attemptId = req.attemptId ?? (await richestAttemptId());
  return { conversationId, attemptId };
}

// Newest non-terminal conversation whose attempt has a live worktree path — the
// `edited-files` first-subscribe fixture (the resource keys on conversation id).
async function newestLiveConversationId(): Promise<string | null> {
  const rows = await executeRows(db, {
    query: sql`
      SELECT c.id
      FROM conversations c
      JOIN attempts a ON a.id = c.attempt_id
      WHERE a.worktree_path IS NOT NULL
        AND c.status NOT IN ('gone', 'done')
      ORDER BY c.created_at DESC
      LIMIT 1
    `,
    row: IdRowSchema,
    label: "boot-bench newest live conversation",
  });
  return rows[0]?.id ?? null;
}

// Attempt with the most pushes (richest git history → meaningful commits-graph
// work), tie-broken by recency, with a live worktree path.
async function richestAttemptId(): Promise<string | null> {
  const rows = await executeRows(db, {
    query: sql`
      SELECT a.id
      FROM attempts a
      WHERE a.worktree_path IS NOT NULL
      ORDER BY (SELECT COUNT(*) FROM pushes p WHERE p.attempt_id = a.id) DESC,
               a.created_at DESC
      LIMIT 1
    `,
    row: IdRowSchema,
    label: "boot-bench richest attempt",
  });
  return rows[0]?.id ?? null;
}
