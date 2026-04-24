import { db } from "@server/db/client";
import { _attempts } from "../tables";
import { attempts } from "../schema";
import { attemptsResource } from "../resources";
import { eq } from "drizzle-orm";

export interface CreateAttemptInput {
  id: string;
  taskId: string;
  worktreePath: string;
}

export async function createAttempt(input: CreateAttemptInput) {
  await db.insert(_attempts).values(input);
  attemptsResource.notify();
  const [row] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, input.id))
    .limit(1);
  return row!;
}
