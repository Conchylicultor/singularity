import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _conversations, _tasks } from "../tables";
import { conversations } from "../views";
import type { Conversation } from "../schema";
import { RECENT_GONE_LIMIT } from "../../../core";

// Re-exported so server-side callers keep importing it from the queries module
// (its canonical source moved to tasks-core/core for client derivation).
export { RECENT_GONE_LIMIT };

// The model column tolerates legacy/unknown values on parse via the
// `tolerantEnum` field in ConversationSchema, so reads need no normalization.

// System conversations (machine-spawned automation) live in the same table but
// never surface in the sidebar, recovery pane, or attempt-view — they're
// plumbing. Only `listConversationsForInfra` opts out of this filter; every
// other entry point excludes them.
const notSystem = ne(conversations.kind, "system");

// Conversations of a *held* task, whatever their own status. Holding is the user
// saying "I am coming back to this", and the canonical "Hold & close" flow closes
// every conversation on the way — so `active` alone excludes exactly the rows a
// hold means to preserve. Built per call rather than hoisted to module scope so
// `db` is never touched at import time.
function onHeldTask(): SQL {
  return inArray(
    conversations.taskId,
    db.select({ id: _tasks.id }).from(_tasks).where(isNotNull(_tasks.heldAt)),
  );
}

type Filters = {
  includeSystem?: boolean;
  onlySystem?: boolean;
  active?: boolean;
  activeOrHeldTask?: boolean;
  endedAtNotNull?: boolean;
  endedAtBefore?: Date;
  taskIds?: readonly string[];
  convIds?: readonly string[];
};

function buildWhere(f: Filters): SQL | undefined {
  const clauses: SQL[] = [];
  if (f.onlySystem) clauses.push(eq(conversations.kind, "system"));
  else if (!f.includeSystem) clauses.push(notSystem);
  if (f.active !== undefined) clauses.push(eq(conversations.active, f.active));
  if (f.activeOrHeldTask) clauses.push(or(eq(conversations.active, true), onHeldTask())!);
  if (f.endedAtNotNull) clauses.push(isNotNull(conversations.endedAt));
  if (f.endedAtBefore) clauses.push(lt(conversations.endedAt, f.endedAtBefore));
  if (f.taskIds) clauses.push(inArray(conversations.taskId, [...f.taskIds]));
  if (f.convIds) clauses.push(inArray(conversations.id, [...f.convIds]));
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
  const q = limit !== undefined ? base.limit(limit) : base;
  return q;
}

// Infra paths only: poller, turn-emitter. Returns active (non-`done`) rows
// including system kinds so tmux death is detected and turn events are emitted
// for system conversations.
//
// Scoped to `active` (status <> 'done') because both callers only ever act on
// non-terminal rows: the poller already skips done/gone, and the turn-emitter
// filters `isActiveStatus` (= status !== 'done'). `gone` rows are retained so
// the poller's resurrection path still sees them. Without this filter the query
// scans every conversation ever created (unbounded history growth) once per
// poller tick. UI must never call this.
export function listConversationsForInfra(): Promise<Conversation[]> {
  return queryConversations(
    { includeSystem: true, active: true },
    { col: conversations.createdAt, dir: "desc" },
  );
}

// Which of the given conversation ids already exist in the table, in ANY status
// (including terminal `done`). The poller's orphan-adoption path needs this:
// `listConversationsForInfra` is scoped to active rows, so a `done` conversation
// whose tmux session lingers host-wide is absent from that list and would be
// re-classified as an orphan — and re-adopted via INSERT … ON CONFLICT DO
// NOTHING — every single tick. Checking existence against the full table (cheap:
// bounded by the candidate id count, hits the PK) keeps terminal conversations
// terminal. Returns a Set for O(1) membership.
export async function listExistingConversationIds(
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: _conversations.id })
    .from(_conversations)
    .where(inArray(_conversations.id, [...ids]));
  return new Set(rows.map((r) => r.id));
}

// User-visible list, newest-first. Sidebar / list endpoint. Pass `taskIds` to
// scope to just those tasks' conversations (Layer-2 scoped recompute — e.g.
// agent-launches recomputing only the affected launches' latest conversation);
// omit it for the full list.
export function listConversationsForDisplay(
  taskIds?: readonly string[],
): Promise<Conversation[]> {
  return queryConversations({ taskIds }, { col: conversations.createdAt, dir: "desc" });
}

// User-visible + active=true. Server-side batch callers (backup, transcript
// retention, cross-table mutations). The conversations-active/-system live-state
// resources no longer route through here — they are declarative `queryResource`s
// (see ../resources.ts), so this needs no scoped-recompute id parameter.
export function listActiveConversations(): Promise<Conversation[]> {
  return queryConversations({ active: true }, { col: conversations.createdAt, dir: "desc" });
}

// User-visible rows whose Claude JSONL transcript must be kept alive: every
// active conversation, PLUS every conversation of a held task regardless of its
// own status. Read by the transcript-touch job (conversations/transcript-
// retention), which refreshes each file's mtime so Claude Code's
// `cleanupPeriodDays` sweep never deletes it — transcripts are the sole source
// of truth for conversation content, so aging one out erases the history.
// `listActiveConversations` is the wrong scope there: a held task is parked, not
// finished, and its conversations are `done` by construction (Hold & close).
export function listRetainedConversations(): Promise<Conversation[]> {
  return queryConversations(
    { activeOrHeldTask: true },
    { col: conversations.createdAt, dir: "desc" },
  );
}

export async function countGoneConversations(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(conversations)
    .where(buildWhere({ active: false, endedAtNotNull: true }));
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row?.value ?? 0;
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
// client renders them in attempt-order without further sorting. Pass
// `attemptIds` to scope the join to just those attempts (Layer 2 scoped
// recompute); omit it for the full list.
export async function listConversationSummariesByAttempt(
  attemptIds?: readonly string[],
): Promise<
  Pick<
    Conversation,
    "id" | "attemptId" | "title" | "status" | "kind" | "createdAt" | "spawnedBy"
  >[]
> {
  const where = attemptIds
    ? and(notSystem, inArray(conversations.attemptId, [...attemptIds]))
    : notSystem;
  return db
    .select({
      id: conversations.id,
      attemptId: conversations.attemptId,
      title: conversations.title,
      status: conversations.status,
      kind: conversations.kind,
      createdAt: conversations.createdAt,
      spawnedBy: conversations.spawnedBy,
    })
    .from(conversations)
    .where(where)
    .orderBy(asc(conversations.createdAt));
}

// Transient conversation columns the aggregate resources (attempts / tasks /
// agent-launches) never read. The poller rewrites these at up to ~1/s on active
// conversations: `waitingFor` (interactive-prompt hint), `updatedAt` (bumped on
// every write), and `lastViewedAt` (selection / turn-sent). The aggregates
// derive only coarse facts — liveness (status), title, kind, ownership, ended/
// created timestamps — so a write touching ONLY these columns would otherwise
// cascade into attempts → tasks → agent-launches and recompute-then-diff-to-
// empty on every tick. See the `signature` cascade gate below.
const TRANSIENT_CONVERSATION_FIELDS = ["waitingFor", "updatedAt", "lastViewedAt"] as const;

// Cascade relevance signature for a conversation change (see
// DependsOnEntry.signature). Returns id → hash of the conversation row MINUS the
// transient fields above, so the conv → attempts and conv → agent-launches edges
// skip a downstream recompute when only a transient field moved. We hash the
// whole row minus a small deny-list (rather than an allow-list of consumed
// columns) so a newly-consumed conversation column is covered automatically —
// the only failure mode of a missed strip is re-churn (which the
// live-state-churn detector re-flags), never stale aggregate data.
export async function conversationCascadeSignatures(
  convIds: ReadonlySet<string>,
): Promise<Map<string, string>> {
  if (convIds.size === 0) return new Map();
  const rows = await db
    .select()
    .from(_conversations)
    .where(inArray(_conversations.id, [...convIds]));
  const sigs = new Map<string, string>();
  for (const row of rows) {
    const relevant: Record<string, unknown> = { ...row };
    for (const f of TRANSIENT_CONVERSATION_FIELDS) delete relevant[f];
    sigs.set(row.id, JSON.stringify(relevant));
  }
  return sigs;
}

// Idle-kill candidates: waiting, not already hibernated, resumable (has a
// saved Claude session), and idle since `before` (lastViewedAt, or createdAt
// when never viewed). Used by the conversations.hibernate-idle job.
export function listHibernationCandidates(before: Date): Promise<{ id: string }[]> {
  return db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.status, "waiting"),
        isNull(conversations.hibernatedAt),
        isNotNull(conversations.claudeSessionId),
        lt(sql`coalesce(${conversations.lastViewedAt}, ${conversations.createdAt})`, before),
      ),
    );
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return undefined;
  return row.claudeSessionId;
}
