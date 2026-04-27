import { and, asc, desc, eq, isNotNull, lt, ne, type SQL } from "drizzle-orm";
import { db } from "@server/db/client";
import { _conversations } from "../tables";
import { conversations } from "../schema";
import type { Conversation } from "../schema";

export const RECENT_GONE_LIMIT = 30;

// System conversations (yak classifiers, future automation) live in the same
// table but never surface in the sidebar, recovery pane, or attempt-view —
// they're machine plumbing. Only `listConversationsForInfra` opts out of this
// filter; every other entry point excludes them.
const notSystem = ne(conversations.kind, "system");

type Filters = {
  includeSystem?: boolean;
  onlySystem?: boolean;
  active?: boolean;
  endedAtNotNull?: boolean;
  endedAtBefore?: Date;
};

function buildWhere(f: Filters): SQL | undefined {
  const clauses: SQL[] = [];
  if (f.onlySystem) clauses.push(eq(conversations.kind, "system"));
  else if (!f.includeSystem) clauses.push(notSystem);
  if (f.active !== undefined) clauses.push(eq(conversations.active, f.active));
  if (f.endedAtNotNull) clauses.push(isNotNull(conversations.endedAt));
  if (f.endedAtBefore) clauses.push(lt(conversations.endedAt, f.endedAtBefore));
  return clauses.length ? and(...clauses) : undefined;
}

type Order = {
  col: typeof conversations.createdAt | typeof conversations.endedAt;
  dir: "asc" | "desc";
};

function queryConversations(
  filters: Filters,
  order: Order,
  limit?: number,
): Promise<Conversation[]> {
  const orderExpr = order.dir === "asc" ? asc(order.col) : desc(order.col);
  const base = db.select().from(conversations).where(buildWhere(filters)).orderBy(orderExpr);
  return limit !== undefined ? base.limit(limit) : base;
}

// Infra paths only: poller, turn-emitter. Returns ALL rows including system
// kinds so tmux death is detected and turn events are emitted for system
// conversations. UI must never call this.
export function listConversationsForInfra(): Promise<Conversation[]> {
  return queryConversations(
    { includeSystem: true },
    { col: conversations.createdAt, dir: "desc" },
  );
}

// User-visible list, newest-first. Sidebar / list endpoint.
export function listConversationsForDisplay(): Promise<Conversation[]> {
  return queryConversations({}, { col: conversations.createdAt, dir: "desc" });
}

// User-visible + active=true. Yak rebuild + recentConversationsResource.
export function listActiveConversations(): Promise<Conversation[]> {
  return queryConversations({ active: true }, { col: conversations.createdAt, dir: "desc" });
}

// Active system-kind conversations only. Used to surface running plumbing
// (yak-shaving rebuild, future automation) in the sidebar behind a debug
// toggle. UI lists must NOT mix these into the regular active list.
export function listActiveSystemConversations(): Promise<Conversation[]> {
  return queryConversations(
    { onlySystem: true, active: true },
    { col: conversations.createdAt, dir: "desc" },
  );
}

// Ended user-visible rows, newest-first by endedAt. Pass `before` for pagination.
export function listGoneConversations(opts: {
  before?: Date;
  limit?: number;
} = {}): Promise<Conversation[]> {
  return queryConversations(
    { active: false, endedAtNotNull: true, endedAtBefore: opts.before },
    { col: conversations.endedAt, dir: "desc" },
    opts.limit,
  );
}

// Narrow projection used by attemptsResource. Sorted oldest-first so the
// client renders them in attempt-order without further sorting.
export async function listConversationSummariesByAttempt(): Promise<
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
    .where(notSystem)
    .orderBy(asc(conversations.createdAt));
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
