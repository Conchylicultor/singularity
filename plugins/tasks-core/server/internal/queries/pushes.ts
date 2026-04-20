import { desc, eq } from "drizzle-orm";
import { db } from "../../../../../server/src/db/client";
import { pushes } from "../tables";
import type { Push } from "../schema";

export async function listPushes(): Promise<Push[]> {
  return db.select().from(pushes).orderBy(desc(pushes.createdAt));
}

export async function listPushesForAttempt(attemptId: string): Promise<Push[]> {
  return db
    .select()
    .from(pushes)
    .where(eq(pushes.attemptId, attemptId))
    .orderBy(desc(pushes.createdAt));
}

export async function getLatestPush(): Promise<Push | null> {
  const [row] = await db
    .select()
    .from(pushes)
    .orderBy(desc(pushes.createdAt))
    .limit(1);
  return row ?? null;
}
