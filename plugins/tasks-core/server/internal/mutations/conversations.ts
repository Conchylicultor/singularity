import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
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
  waitingFor?: string | null;
  endedAt?: Date | null;
  updatedAt?: Date;
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
  input: InsertConversationInput & { status: "starting" | "working" | "waiting" | "gone" },
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
  if (patch.waitingFor !== undefined) dbPatch.waitingFor = patch.waitingFor;
  if (patch.endedAt !== undefined) dbPatch.endedAt = patch.endedAt;

  await db.update(_conversations).set(dbPatch).where(eq(_conversations.id, id));
  if (taskId) await emitStatusChangeIfChanged(taskId, before);
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

  recentConversationsResource.notify();
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
