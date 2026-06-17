import { asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { attempts } from "../views";
import type { Attempt } from "../schema";

export async function listAttempts(): Promise<Attempt[]> {
  return db.select().from(attempts).orderBy(asc(attempts.createdAt));
}

export async function getAttempt(id: string): Promise<Attempt | null> {
  const [row] = await db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row ?? null;
}

export async function listAttemptsForTask(taskId: string): Promise<Attempt[]> {
  return db
    .select()
    .from(attempts)
    .where(eq(attempts.taskId, taskId))
    .orderBy(asc(attempts.createdAt));
}
