import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import type { ConversationStatus } from "../../../core/conversation-status";
import { _attempts, _conversations } from "../tables";
import { conversations } from "../schema";
import { conversationsLiveResource } from "../resources";
import { emitStatusChangeIfChanged, emitConversationStatusChange, readTaskStatus } from "../status-emit";

export interface InsertConversationInput {
  id: string;
  attemptId: string;
  runtime: string;
  model: ConversationModel;
  spawnedBy: string;
  kind?: "user" | "agent" | "system";
  status?: "starting" | "working" | "waiting" | "gone" | "done";
  title?: string | null;
}

export interface UpdateConversationPatch {
  status?: "starting" | "working" | "waiting" | "gone" | "done";
  title?: string | null;
  claudeSessionId?: string | null;
  waitingFor?: string | null;
  endedAt?: Date | null;
  updatedAt?: Date;
  closeRequested?: boolean;
}

// Resolve the owning task id AND the current status of a conversation in one
// read. `taskId` is null when the conversation/attempt was already deleted (the
// task FK cascades, so this can happen during teardown); `status` is null in
// the same case. Callers snapshot the status before a write so they can emit a
// `conversation.statusChanged` transition afterwards.
async function conversationContext(
  conversationId: string,
): Promise<{ taskId: string | null; status: ConversationStatus | null }> {
  const [row] = await db
    .select({ taskId: _attempts.taskId, status: _conversations.status })
    .from(_conversations)
    .innerJoin(_attempts, eq(_attempts.id, _conversations.attemptId))
    .where(eq(_conversations.id, conversationId))
    .limit(1);
  return {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    taskId: row?.taskId ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    status: (row?.status as ConversationStatus | undefined) ?? null,
  };
}

async function taskIdForAttempt(attemptId: string): Promise<string | null> {
  const [row] = await db
    .select({ taskId: _attempts.taskId })
    .from(_attempts)
    .where(eq(_attempts.id, attemptId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row?.taskId ?? null;
}

export async function insertConversation(input: InsertConversationInput) {
  const taskId = await taskIdForAttempt(input.attemptId);
  const before = taskId ? await readTaskStatus(taskId) : null;
  await db.insert(_conversations).values({
    id: input.id,
    attemptId: input.attemptId,
    runtime: input.runtime,
    model: input.model,
    spawnedBy: input.spawnedBy,
    kind: input.kind ?? "user",
    status: input.status ?? "starting",
    title: input.title ?? null,
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
  input: InsertConversationInput & { status: "starting" | "working" | "waiting" | "gone" | "done" },
) {
  const taskId = await taskIdForAttempt(input.attemptId);
  const before = taskId ? await readTaskStatus(taskId) : null;
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
    })
    .onConflictDoNothing()
    .returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (row && taskId) await emitStatusChangeIfChanged(taskId, before);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row ?? null;
}

export async function updateConversation(
  id: string,
  patch: UpdateConversationPatch,
): Promise<void> {
  const { taskId, status: prevStatus } = await conversationContext(id);
  const before = taskId ? await readTaskStatus(taskId) : null;
  const dbPatch: Record<string, unknown> = { updatedAt: patch.updatedAt ?? new Date() };
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.claudeSessionId !== undefined) dbPatch.claudeSessionId = patch.claudeSessionId;
  if (patch.waitingFor !== undefined) dbPatch.waitingFor = patch.waitingFor;
  if (patch.endedAt !== undefined) dbPatch.endedAt = patch.endedAt;
  if (patch.closeRequested !== undefined) dbPatch.closeRequested = patch.closeRequested;

  await db.update(_conversations).set(dbPatch).where(eq(_conversations.id, id));
  if (taskId) await emitStatusChangeIfChanged(taskId, before);
  if (patch.status !== undefined)
    await emitConversationStatusChange(id, taskId, prevStatus, patch.status);
}

export async function updateConversationsTitleForTask(
  taskId: string,
  title: string,
): Promise<void> {
  const rows = await db
    .select({ id: _conversations.id })
    .from(_conversations)
    .innerJoin(_attempts, eq(_conversations.attemptId, _attempts.id))
    .where(and(eq(_attempts.taskId, taskId), isNull(_conversations.title)));

  if (rows.length === 0) return;

  await db
    .update(_conversations)
    .set({ title, updatedAt: new Date() })
    .where(inArray(_conversations.id, rows.map((r) => r.id)));

  conversationsLiveResource.notify();
}

export async function deleteConversationRow(id: string): Promise<void> {
  const { taskId, status: prevStatus } = await conversationContext(id);
  const before = taskId ? await readTaskStatus(taskId) : null;
  await db.delete(_conversations).where(eq(_conversations.id, id));
  conversationsLiveResource.notify();
  if (taskId) await emitStatusChangeIfChanged(taskId, before);
  // A hard delete cascades away the conversation's queue rank row (entity
  // extension, FK CASCADE). Emit a terminal transition so the queue refreshes
  // its ranks and revalidates the pin — the conversation is no longer present.
  if (prevStatus !== null)
    await emitConversationStatusChange(id, taskId, prevStatus, "done");
}

// Atomically transition to "gone" only if the current status is still active.
// Returns true if the row was updated, false if it was already gone/done.
// Prevents the poller from overwriting a "done" set by the exit_clean flow.
export async function markConversationGone(id: string): Promise<boolean> {
  const { taskId, status: prevStatus } = await conversationContext(id);
  const before = taskId ? await readTaskStatus(taskId) : null;
  const now = new Date();
  const result = await db
    .update(_conversations)
    .set({ status: "gone", endedAt: now, waitingFor: null, updatedAt: now })
    .where(
      and(
        eq(_conversations.id, id),
        notInArray(_conversations.status, ["gone", "done"]),
      ),
    )
    .returning({ id: _conversations.id });
  if (result.length > 0) {
    if (taskId) await emitStatusChangeIfChanged(taskId, before);
    await emitConversationStatusChange(id, taskId, prevStatus, "gone");
  }
  return result.length > 0;
}

export async function markConversationClosed(
  id: string,
  endedAt: Date = new Date(),
): Promise<void> {
  const { taskId, status: prevStatus } = await conversationContext(id);
  const before = taskId ? await readTaskStatus(taskId) : null;
  await db
    .update(_conversations)
    .set({ status: "done", endedAt, updatedAt: new Date() })
    .where(eq(_conversations.id, id));
  if (taskId) await emitStatusChangeIfChanged(taskId, before);
  await emitConversationStatusChange(id, taskId, prevStatus, "done");
}
