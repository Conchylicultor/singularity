import { randomUUID } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@plugins/database/server";
import {
  _conversations,
  getConversation,
} from "@plugins/tasks/plugins/tasks-core/server";
import { _heldTurns } from "./tables-held-turns";
import { userTurnSent } from "./tables-user-turn-sent-event";

// Held turns: a turn the user sends while the conversation is still `starting`
// is accepted and KEPT here until the agent can take it, rather than typed into
// a pane that does not exist yet (send-keys fails, the turn is lost) or into a
// TUI still drawing itself (the keystrokes land nowhere and verification times
// out). See research/2026-10-08-conversations-optimistic-first-turn.md.
//
// Exactly one of two paths delivers a held turn:
//
//   A. The launch message (spawn-job.ts → launchWithHeldTurn). The spawn reads
//      the oldest held turn before `runtime.create`, appends it to the launch
//      prompt (after the baked preprompt block, so the preprompt stays first),
//      creates the session, and deletes the row. Claude then starts on it
//      directly, never idling at an empty prompt.
//   B. The flush when the agent becomes ready (deliver-held-turns-job.ts →
//      deliverHeldTurns). The status reconciler enqueues it after it moves a
//      row out of `starting`; it waits for the input box, then types each held
//      turn in order through the ordinary verified send.
//
// Two locks make "exactly one, in order" structural:
//
//   - The ACCEPT (`acceptTurn`) takes the conversation ROW lock and reads its
//     status in the same transaction. Every status flip out of `starting` is an
//     UPDATE of that row, so it serializes behind the accept: a turn is either
//     held before the flip — and the flush the reconciler enqueues AFTER its
//     write sees it — or the accept sees the new status and sends directly. No
//     turn can be held after the last flush looked.
//   - The two DELIVERY paths take one per-conversation ADVISORY lock
//     (`withDeliveryLock`) around read → deliver → delete. Without it a flush
//     that read the held set while the spawn was still between `create` and its
//     delete would type the launch message a second time.
//
// Path A can take only ONE turn: the launch message is one transcript row, and
// one row confirms one pending-turn record in the browser (the matcher's
// consumed-index set). Any further held turns go to path B, which the status
// flip that follows the launch triggers.
//
// The one window that can duplicate: a crash after the agent got a turn and
// before its row's delete commits. On retry the row is still held and is
// delivered again. The alternative ordering (delete first) loses the turn
// instead; a duplicate the user can see beats a message that silently vanished.

export interface HeldTurn {
  id: string;
  text: string;
  rawText: string;
}

/** What the accept decided for one posted turn. */
export type AcceptOutcome =
  { kind: "held" } | { kind: "send" } | { kind: "not-found" };

/**
 * Hold the turn when the conversation is `starting`, else tell the caller to
 * send it now. The row lock is what the delivery paths' correctness rests on —
 * see the header. `send` releases the lock before the caller sends: the send can
 * itself write the row (a hibernated conversation resumes first), and holding
 * the lock across that would wait on itself.
 *
 * `conn` is injectable so DB-backed tests can drive a throwaway database.
 */
export async function acceptTurn(
  conversationId: string,
  turn: { text: string; rawText: string },
  conn: NodePgDatabase = db,
): Promise<AcceptOutcome> {
  return conn.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: _conversations.status })
      .from(_conversations)
      .where(eq(_conversations.id, conversationId))
      .for("update");
    if (!row) return { kind: "not-found" };
    if (row.status !== "starting") return { kind: "send" };
    await tx.insert(_heldTurns).values({
      id: randomUUID(),
      conversationId,
      text: turn.text,
      rawText: turn.rawText,
    });
    return { kind: "held" };
  });
}

/** The conversation's held turns, in the order they were accepted. */
export async function listHeldTurns(
  conversationId: string,
  conn: Pick<NodePgDatabase, "select"> = db,
): Promise<HeldTurn[]> {
  return conn
    .select({
      id: _heldTurns.id,
      text: _heldTurns.text,
      rawText: _heldTurns.rawText,
    })
    .from(_heldTurns)
    .where(eq(_heldTurns.conversationId, conversationId))
    .orderBy(asc(_heldTurns.createdAt), asc(_heldTurns.id));
}

async function deleteHeldTurns(
  ids: readonly string[],
  conn: NodePgDatabase,
): Promise<void> {
  if (ids.length === 0) return;
  await conn.delete(_heldTurns).where(inArray(_heldTurns.id, [...ids]));
}

/**
 * Run `fn` holding the conversation's delivery lock: a transaction-scoped
 * advisory lock (transaction pooling makes a session lock meaningless), released
 * when `fn` settles. `fn` is handed the transaction to read through; deletes go
 * through `conn` so each one commits the moment its turn is delivered — a later
 * failure in the same run then cannot put an already-delivered turn back.
 */
async function withDeliveryLock<T>(
  conversationId: string,
  conn: NodePgDatabase,
  fn: (tx: Pick<NodePgDatabase, "select">) => Promise<T>,
): Promise<T> {
  return conn.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`conversation-held-turns:${conversationId}`}, 0))`,
    );
    return fn(tx);
  });
}

/**
 * The launch message: the launch's own prompt (which carries the baked
 * preprompt block first, when the task has one), then the held turn.
 */
export function mergeLaunchPrompt(
  basePrompt: string | undefined,
  heldText: string,
): string {
  return basePrompt ? `${basePrompt}\n\n${heldText}` : heldText;
}

/**
 * Path A. `launch` starts the session with the prompt it is handed; the oldest
 * held turn (if any) rides in it and its row is deleted once `launch` resolves.
 * Returns the turn delivered this way, for the caller's `userTurnSent`.
 *
 * Call it only for a session that does not exist yet: a retry whose earlier
 * attempt already created the session must not run it, since `create` would
 * no-op and the turn read here would be deleted undelivered.
 */
export async function launchWithHeldTurn(
  conversationId: string,
  basePrompt: string | undefined,
  launch: (prompt: string | undefined) => Promise<void>,
  conn: NodePgDatabase = db,
): Promise<HeldTurn | null> {
  return withDeliveryLock(conversationId, conn, async (tx) => {
    const [first] = await listHeldTurns(conversationId, tx);
    await launch(
      first ? mergeLaunchPrompt(basePrompt, first.text) : basePrompt,
    );
    if (!first) return null;
    await deleteHeldTurns([first.id], conn);
    return first;
  });
}

/**
 * Path B. Sends every held turn, oldest first, deleting each one as it lands.
 * `send` is the ordinary verified send; when it throws, the failed turn and
 * every later one stay held (order is kept) and the error propagates. Returns
 * the turns delivered, for the caller's `userTurnSent`.
 */
export async function deliverHeldTurns(
  conversationId: string,
  send: (text: string) => Promise<void>,
  conn: NodePgDatabase = db,
): Promise<HeldTurn[]> {
  return withDeliveryLock(conversationId, conn, async (tx) => {
    const delivered: HeldTurn[] = [];
    for (const turn of await listHeldTurns(conversationId, tx)) {
      await send(turn.text);
      await deleteHeldTurns([turn.id], conn);
      delivered.push(turn);
    }
    return delivered;
  });
}

/** Whether the conversation has any undelivered held turn. */
export async function hasHeldTurns(
  conversationId: string,
  conn: NodePgDatabase = db,
): Promise<boolean> {
  const [row] = await conn
    .select({ id: _heldTurns.id })
    .from(_heldTurns)
    .where(eq(_heldTurns.conversationId, conversationId))
    .limit(1);
  return row !== undefined;
}

/**
 * `conversation.userTurnSent` for turns a held-turn path delivered — emitted
 * here, at delivery, never at accept: the event means the agent got the turn.
 */
export async function emitDelivered(
  conversationId: string,
  delivered: readonly HeldTurn[],
): Promise<void> {
  if (delivered.length === 0) return;
  const conv = await getConversation(conversationId);
  if (!conv) return;
  for (const turn of delivered) {
    await userTurnSent.emit({
      conversationId,
      taskId: conv.taskId,
      text: turn.rawText,
    });
  }
}
