import { asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { attempts } from "../views";
import type { Attempt } from "../schema";
import type { DbExecutor } from "../status-batch";

export async function listAttempts(): Promise<Attempt[]> {
  return db.select().from(attempts).orderBy(asc(attempts.createdAt));
}

export async function getAttempt(id: string): Promise<Attempt | null> {
  const [row] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, id))
    .limit(1);
  return row ?? null;
}

// `exec`: read on a caller's transaction when the answer gates a write in it
// (the auto-launch's "did a manual start win?" check).
export async function listAttemptsForTask(
  taskId: string,
  exec: DbExecutor = db,
): Promise<Attempt[]> {
  return exec
    .select()
    .from(attempts)
    .where(eq(attempts.taskId, taskId))
    .orderBy(asc(attempts.createdAt));
}
