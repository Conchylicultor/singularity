import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@server/db/client";
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

export async function listPushesByPushId(pushId: string): Promise<Push[]> {
  return db
    .select()
    .from(pushes)
    .where(eq(pushes.pushId, pushId))
    .orderBy(asc(pushes.createdAt));
}

export async function getLatestPush(): Promise<Push | null> {
  const [row] = await db
    .select()
    .from(pushes)
    .orderBy(desc(pushes.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listPushShasIn(shas: string[]): Promise<Set<string>> {
  if (shas.length === 0) return new Set();
  const rows = await db
    .select({ sha: pushes.sha })
    .from(pushes)
    .where(inArray(pushes.sha, shas));
  return new Set(rows.map((r) => r.sha));
}
