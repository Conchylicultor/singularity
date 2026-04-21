import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db } from "../../../../../server/src/db/client";
import { _conversations } from "../tables";
import { conversations } from "../schema";
import type { Conversation } from "../schema";

export const RECENT_GONE_LIMIT = 30;

export async function listConversations(): Promise<Conversation[]> {
  return db.select().from(conversations).orderBy(desc(conversations.createdAt));
}

export async function listActiveConversations(): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.active, true))
    .orderBy(desc(conversations.createdAt));
}

// Narrow projection used by attemptsResource for the embedded conversations
// field. Returns every conversation (no limit) sorted oldest-first so the
// client can render them in attempt-order without further sorting.
export async function listAllConversationSummaries(): Promise<
  Pick<Conversation, "id" | "attemptId" | "title" | "status">[]
> {
  return db
    .select({
      id: conversations.id,
      attemptId: conversations.attemptId,
      title: conversations.title,
      status: conversations.status,
    })
    .from(conversations)
    .orderBy(asc(conversations.createdAt));
}

export async function listRecentGoneConversations(limit: number): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.active, false))
    .orderBy(desc(conversations.createdAt))
    .limit(limit);
}

export async function listGoneConversationsBefore(
  before: Date,
  limit: number,
): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(and(eq(conversations.active, false), lt(conversations.createdAt, before)))
    .orderBy(desc(conversations.createdAt))
    .limit(limit);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return row ?? null;
}

// Reads only the columns needed by the runtime (no join, no derived fields).
export async function getConversationRuntime(
  id: string,
): Promise<{ status: string; runtime: string; claudeSessionId: string | null } | null> {
  const [row] = await db
    .select({
      status: _conversations.status,
      runtime: _conversations.runtime,
      claudeSessionId: _conversations.claudeSessionId,
    })
    .from(_conversations)
    .where(eq(_conversations.id, id))
    .limit(1);
  return row ?? null;
}

// Returns claudeSessionId for transcript lookup. Returns `undefined` when the
// conversation row does not exist (vs `null` when it exists but has no session).
export async function getConversationClaudeSessionId(
  id: string,
): Promise<string | null | undefined> {
  const [row] = await db
    .select({ claudeSessionId: _conversations.claudeSessionId })
    .from(_conversations)
    .where(eq(_conversations.id, id))
    .limit(1);
  if (!row) return undefined;
  return row.claudeSessionId;
}
