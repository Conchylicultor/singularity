import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { _conversations } from "../tables";
import { conversations } from "../schema";
import { recentConversationsResource } from "../resources";

export interface InsertConversationInput {
  id: string;
  attemptId: string;
  runtime: string;
  model: "opus" | "sonnet";
  spawnedBy: string;
  status?: "starting" | "working" | "waiting" | "gone";
  title?: string | null;
}

export interface UpdateConversationPatch {
  status?: "starting" | "working" | "waiting" | "gone";
  title?: string | null;
  claudeSessionId?: string | null;
  endedAt?: Date | null;
  updatedAt?: Date;
}

export async function insertConversation(input: InsertConversationInput) {
  await db.insert(_conversations).values({
    id: input.id,
    attemptId: input.attemptId,
    runtime: input.runtime,
    model: input.model,
    spawnedBy: input.spawnedBy,
    status: input.status ?? "starting",
    title: input.title ?? null,
  });
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.id))
    .limit(1);
  return row!;
}

export async function insertConversationOnConflictDoNothing(
  input: InsertConversationInput & { status: "starting" | "working" | "waiting" | "gone" },
) {
  const [row] = await db
    .insert(_conversations)
    .values({
      id: input.id,
      attemptId: input.attemptId,
      runtime: input.runtime,
      model: input.model,
      spawnedBy: input.spawnedBy,
      status: input.status,
      title: input.title ?? null,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function updateConversation(
  id: string,
  patch: UpdateConversationPatch,
): Promise<void> {
  const dbPatch: Record<string, unknown> = { updatedAt: patch.updatedAt ?? new Date() };
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.claudeSessionId !== undefined) dbPatch.claudeSessionId = patch.claudeSessionId;
  if (patch.endedAt !== undefined) dbPatch.endedAt = patch.endedAt;
  await db.update(_conversations).set(dbPatch).where(eq(_conversations.id, id));
}

export async function deleteConversationRow(id: string): Promise<void> {
  await db.delete(_conversations).where(eq(_conversations.id, id));
  recentConversationsResource.notify();
}

export async function markConversationClosed(
  id: string,
  endedAt: Date = new Date(),
): Promise<void> {
  await db
    .update(_conversations)
    .set({ status: "gone", endedAt, updatedAt: new Date() })
    .where(eq(_conversations.id, id));
}
