import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@server/db/client";
import { _attempts, _conversations } from "../tables";
import { conversations } from "../schema";
import { recentConversationsResource } from "../resources";
import { emitStatusChangeIfChanged, readTaskStatus } from "../status-emit";

export interface InsertConversationInput {
  id: string;
  attemptId: string;
  runtime: string;
  model: "opus" | "sonnet";
  spawnedBy: string;
  kind?: "user" | "agent" | "system";
  status?: "starting" | "working" | "waiting" | "gone";
  title?: string | null;
}

export interface UpdateConversationPatch {
  status?: "starting" | "working" | "waiting" | "gone";
  title?: string | null;
  claudeSessionId?: string | null;
  endedAt?: Date | null;
  rank?: string;
  updatedAt?: Date;
}

// Anki-style priority queue rank helpers. The queue is a single global ordered
// list of `waiting` conversations; rank is assigned at insert time (end of
// deck) and reassigned on every transition into waiting from a non-waiting
// state to "position 2" (one slot below the current top), so the top stays
// stable while items cycle through working.

// End of deck: greater than every currently-waiting rank.
async function endRank(): Promise<string> {
  const [last] = await db
    .select({ rank: _conversations.rank })
    .from(_conversations)
    .where(
      and(eq(_conversations.status, "waiting"), isNotNull(_conversations.rank)),
    )
    .orderBy(desc(_conversations.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}

// Position 2 of the deck: between the current top and second-place ranks.
// 0 waiting → returns any rank (becomes the only item).
// 1 waiting → returns a rank after that single item.
async function positionTwoRank(): Promise<string> {
  const top2 = await db
    .select({ rank: _conversations.rank })
    .from(_conversations)
    .where(
      and(eq(_conversations.status, "waiting"), isNotNull(_conversations.rank)),
    )
    .orderBy(asc(_conversations.rank))
    .limit(2);
  const top = top2[0]?.rank ?? null;
  const second = top2[1]?.rank ?? null;
  return generateKeyBetween(top, second);
}

// Resolve the task id of the attempt that owns this conversation. Returns
// null when the conversation was already deleted (or the attempt was — the
// task FK cascades, so this can happen during teardown).
async function taskIdForConversation(conversationId: string): Promise<string | null> {
  const [row] = await db
    .select({ taskId: _attempts.taskId })
    .from(_conversations)
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(eq(_conversations.id, conversationId))
    .limit(1);
  return row?.taskId ?? null;
}

async function taskIdForAttempt(attemptId: string): Promise<string | null> {
  const [row] = await db
    .select({ taskId: _attempts.taskId })
    .from(_attempts)
    .where(eq(_attempts.id, attemptId))
    .limit(1);
  return row?.taskId ?? null;
}

export async function insertConversation(input: InsertConversationInput) {
  const taskId = await taskIdForAttempt(input.attemptId);
  const before = taskId ? await readTaskStatus(taskId) : null;
  const rank = await endRank();
  await db.insert(_conversations).values({
    id: input.id,
    attemptId: input.attemptId,
    runtime: input.runtime,
    model: input.model,
    spawnedBy: input.spawnedBy,
    kind: input.kind ?? "user",
    status: input.status ?? "starting",
    title: input.title ?? null,
    rank,
  });
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.id))
    .limit(1);
  if (taskId) await emitStatusChangeIfChanged(taskId, before);
  return row!;
}

export async function insertConversationOnConflictDoNothing(
  input: InsertConversationInput & { status: "starting" | "working" | "waiting" | "gone" },
) {
  const taskId = await taskIdForAttempt(input.attemptId);
  const before = taskId ? await readTaskStatus(taskId) : null;
  const rank = await endRank();
  const [row] = await db
    .insert(_conversations)
    .values({
      id: input.id,
      attemptId: input.attemptId,
      runtime: input.runtime,
      model: input.model,
      spawnedBy: input.spawnedBy,
      kind: input.kind ?? "user",
      status: input.status,
      title: input.title ?? null,
      rank,
    })
    .onConflictDoNothing()
    .returning();
  if (row && taskId) await emitStatusChangeIfChanged(taskId, before);
  return row ?? null;
}

export async function updateConversation(
  id: string,
  patch: UpdateConversationPatch,
): Promise<void> {
  const taskId = await taskIdForConversation(id);
  const before = taskId ? await readTaskStatus(taskId) : null;
  const dbPatch: Record<string, unknown> = { updatedAt: patch.updatedAt ?? new Date() };
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.claudeSessionId !== undefined) dbPatch.claudeSessionId = patch.claudeSessionId;
  if (patch.endedAt !== undefined) dbPatch.endedAt = patch.endedAt;
  if (patch.rank !== undefined) dbPatch.rank = patch.rank;

  // Anki-style cycling rule: every transition into `waiting` from a
  // non-waiting state reassigns the rank to "position 2" (between the current
  // top and second-place waiting ranks). Drag-set ranks are intentionally not
  // honoured across cycles — the user's expectation is that the top of the
  // deck stays stable while items they just finished slot in beneath it.
  // Manual reorder (the queue plugin's reorder route) sets `patch.rank`
  // explicitly, which short-circuits this branch.
  if (patch.status === "waiting" && patch.rank === undefined) {
    const [prev] = await db
      .select({ status: _conversations.status })
      .from(_conversations)
      .where(eq(_conversations.id, id))
      .limit(1);
    if (prev && prev.status !== "waiting") {
      dbPatch.rank = await positionTwoRank();
    }
  }

  await db.update(_conversations).set(dbPatch).where(eq(_conversations.id, id));
  if (taskId) await emitStatusChangeIfChanged(taskId, before);
}

export async function deleteConversationRow(id: string): Promise<void> {
  const taskId = await taskIdForConversation(id);
  const before = taskId ? await readTaskStatus(taskId) : null;
  await db.delete(_conversations).where(eq(_conversations.id, id));
  recentConversationsResource.notify();
  if (taskId) await emitStatusChangeIfChanged(taskId, before);
}

export async function markConversationClosed(
  id: string,
  endedAt: Date = new Date(),
): Promise<void> {
  const taskId = await taskIdForConversation(id);
  const before = taskId ? await readTaskStatus(taskId) : null;
  await db
    .update(_conversations)
    .set({ status: "gone", endedAt, updatedAt: new Date() })
    .where(eq(_conversations.id, id));
  if (taskId) await emitStatusChangeIfChanged(taskId, before);
}
