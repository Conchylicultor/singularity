import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@plugins/database/server";
import { _conversationSessions } from "./tables";

/** One link of a conversation's session chain. */
export interface SessionChainEntry {
  claudeSessionId: string;
  seenAt: Date;
}

/**
 * Append `claudeSessionId` to the conversation's chain, unless it is already the
 * tail. Called from the poller's 1s tick, so the steady state — the tail is
 * already this id — must cost one indexed row read and no write.
 *
 * Append-only: never UPDATEs, never DELETEs.
 *
 * Race safety is CONSTRAINT-based, not read-then-write: the tail probe is a
 * cheap fast path, and the insert is guarded by the UNIQUE (conversation_id,
 * claude_session_id) index via ON CONFLICT DO NOTHING. Two ticks (or two
 * processes) that both observe the same new id therefore cannot both append —
 * the loser writes nothing rather than racing on a stale read. This also means
 * a session id that flaps away and back never re-enters the chain: its position
 * stays pinned at first-seen, which is what the transcript merge wants (first
 * occurrence wins, original timestamps survive).
 *
 * `conn` is injectable so DB-backed tests can drive a throwaway database.
 */
export async function recordSessionId(
  conversationId: string,
  claudeSessionId: string,
  conn: NodePgDatabase = db,
): Promise<void> {
  const [tail] = await conn
    .select({ claudeSessionId: _conversationSessions.claudeSessionId })
    .from(_conversationSessions)
    .where(eq(_conversationSessions.conversationId, conversationId))
    .orderBy(desc(_conversationSessions.seenAt))
    .limit(1);

  if (tail?.claudeSessionId === claudeSessionId) return;

  await conn
    .insert(_conversationSessions)
    .values({ id: randomUUID(), conversationId, claudeSessionId })
    .onConflictDoNothing({
      target: [
        _conversationSessions.conversationId,
        _conversationSessions.claudeSessionId,
      ],
    });
}

/**
 * The conversation's session chain, oldest → newest. An empty array is a
 * legitimate answer (no session observed yet), not an absorbed failure: a DB
 * error propagates.
 */
export async function listSessionChain(
  conversationId: string,
  conn: NodePgDatabase = db,
): Promise<SessionChainEntry[]> {
  return await conn
    .select({
      claudeSessionId: _conversationSessions.claudeSessionId,
      seenAt: _conversationSessions.seenAt,
    })
    .from(_conversationSessions)
    .where(eq(_conversationSessions.conversationId, conversationId))
    .orderBy(asc(_conversationSessions.seenAt));
}
