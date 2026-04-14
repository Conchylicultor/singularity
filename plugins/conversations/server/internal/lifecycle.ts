import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { Runtime } from "../api";
import { conversations } from "../schema";
import type { Conversation } from "../../shared/types";
import { forkDatabase } from "./db-fork";
import {
  CONVERSATION_PREFIX,
  setupWorktree,
  worktreePathFor,
} from "./worktree";

const DEFAULT_RUNTIME = "tmux";

export async function createConversation(
  runtimeId: string = DEFAULT_RUNTIME,
): Promise<Conversation> {
  const runtime = Runtime.get(runtimeId);
  const id = `${CONVERSATION_PREFIX}-${Math.floor(Date.now() / 1000)}`;
  const wtPath = await worktreePathFor(id);

  await setupWorktree(id, wtPath);
  await forkDatabase(id);

  // Insert the DB row BEFORE the runtime spawns so the poller never observes
  // a live session without a matching DB row (which would trigger orphan
  // adoption).
  const [row] = await db
    .insert(conversations)
    .values({ id, worktreePath: wtPath, runtime: runtimeId })
    .returning();

  await runtime.create(id, wtPath);
  return row!;
}

export async function deleteConversation(id: string): Promise<void> {
  const [row] = await db
    .select({ runtime: conversations.runtime })
    .from(conversations)
    .where(eq(conversations.id, id));
  const runtimeId = row?.runtime ?? DEFAULT_RUNTIME;
  await Runtime.get(runtimeId).delete(id);
}
