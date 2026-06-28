import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { BootBenchRunBody } from "../../shared/endpoints";

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
  const conversationId = req.conversationId ?? (await newestLiveConversationId());
  const attemptId = req.attemptId ?? (await richestAttemptId());
  return { conversationId, attemptId };
}

// Newest non-terminal conversation whose attempt has a live worktree path — the
// `edited-files` first-subscribe fixture (the resource keys on conversation id).
async function newestLiveConversationId(): Promise<string | null> {
  const res = await db.execute<{ id: string }>(sql`
    SELECT c.id
    FROM conversations c
    JOIN attempts a ON a.id = c.attempt_id
    WHERE a.worktree_path IS NOT NULL
      AND c.status NOT IN ('gone', 'done')
    ORDER BY c.created_at DESC
    LIMIT 1
  `);
  return res.rows[0]?.id ?? null;
}

// Attempt with the most pushes (richest git history → meaningful commits-graph
// work), tie-broken by recency, with a live worktree path.
async function richestAttemptId(): Promise<string | null> {
  const res = await db.execute<{ id: string }>(sql`
    SELECT a.id
    FROM attempts a
    WHERE a.worktree_path IS NOT NULL
    ORDER BY (SELECT COUNT(*) FROM pushes p WHERE p.attempt_id = a.id) DESC,
             a.created_at DESC
    LIMIT 1
  `);
  return res.rows[0]?.id ?? null;
}
