import { db } from "@server/db/client";
import { pushes } from "../tables";
import { pushesResource, attemptsResource } from "../resources";

export interface InsertPushInput {
  id: string;
  attemptId: string;
  conversationId: string;
  sha: string;
  pushId: string;
  message: string;
  createdAt: Date;
}

// Returns true if the row was inserted (false = already existed).
export async function insertPush(input: InsertPushInput): Promise<boolean> {
  const [row] = await db
    .insert(pushes)
    .values(input)
    .onConflictDoNothing()
    .returning();
  if (row) {
    pushesResource.notify();
    attemptsResource.notify();
  }
  return !!row;
}
