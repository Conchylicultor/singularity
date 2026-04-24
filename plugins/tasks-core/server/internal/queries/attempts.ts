import { asc, eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { attempts } from "../schema";
import type { Attempt } from "../schema";

export async function listAttempts(): Promise<Attempt[]> {
  return db.select().from(attempts).orderBy(asc(attempts.createdAt));
}

export async function getAttempt(id: string): Promise<Attempt | null> {
  const [row] = await db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
  return row ?? null;
}

export async function listAttemptsForTask(taskId: string): Promise<Attempt[]> {
  return db
    .select()
    .from(attempts)
    .where(eq(attempts.taskId, taskId))
    .orderBy(asc(attempts.createdAt));
}
