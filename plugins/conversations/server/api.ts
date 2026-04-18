import { eq } from "drizzle-orm";
import { db } from "../../../server/src/db/client";
import { _conversations } from "./schema_internal";
import {
  findTranscriptPath,
  readTurns,
  type Turn,
} from "./internal/claude-transcript";
import type { ConversationModel } from "./model";

export interface RuntimeInfo {
  title: string;
  /** True while Claude is actively processing (spinner visible). False when waiting for user input or in a default/unused pane state. */
  working: boolean;
  /** True when the underlying process has exited but the pane/session shell still lingers. */
  dead: boolean;
  claudeSessionId: string | null;
}

export interface ConversationRuntime {
  readonly id: string;
  create(
    conversationId: string,
    worktreePath: string,
    opts?: {
      prompt?: string;
      model?: ConversationModel;
      /**
       * Worktree slug of the backend that spawned this conversation. The
       * runtime exports this as `SINGULARITY_PARENT_HOST` so the spawned
       * Claude's MCP config can dial back to the owning backend.
       */
      spawnedBy?: string | null;
    },
  ): Promise<void>;
  delete(conversationId: string): Promise<void>;
  list(): Promise<Map<string, RuntimeInfo>>;
  /**
   * Post a user turn into the running conversation. The text is delivered to
   * Claude exactly as if the user had typed it into the pane and hit Enter.
   */
  send(conversationId: string, text: string): Promise<void>;
}

const registry = new Map<string, ConversationRuntime>();

export const Runtime = {
  register(runtime: ConversationRuntime): void {
    if (registry.has(runtime.id)) {
      throw new Error(`Runtime "${runtime.id}" already registered`);
    }
    registry.set(runtime.id, runtime);
  },
  get(id: string): ConversationRuntime {
    const runtime = registry.get(id);
    if (!runtime) throw new Error(`Unknown runtime "${id}"`);
    return runtime;
  },
  all(): ConversationRuntime[] {
    return Array.from(registry.values());
  },
};

export { conversationsResource } from "./internal/resources";
export {
  ensureMainWorktreeRoot,
  worktreePathFor,
  worktreePathForSync,
} from "./internal/worktree";
export { createConversation, deleteConversation } from "./internal/lifecycle";
export type { Turn } from "./internal/claude-transcript";

export async function getConversationRow(id: string): Promise<{
  status: string;
  runtime: string;
  claudeSessionId: string | null;
} | null> {
  const [row] = await db
    .select({
      status: _conversations.status,
      runtime: _conversations.runtime,
      claudeSessionId: _conversations.claudeSessionId,
    })
    .from(_conversations)
    .where(eq(_conversations.id, id))
    .limit(1);
  return row ?? null;
}

export async function readConversationTurns(
  id: string,
  since?: string,
): Promise<Turn[]> {
  const [row] = await db
    .select({ claudeSessionId: _conversations.claudeSessionId })
    .from(_conversations)
    .where(eq(_conversations.id, id))
    .limit(1);
  if (!row?.claudeSessionId) return [];
  const path = await findTranscriptPath(row.claudeSessionId);
  if (!path) return [];
  return readTurns(path, since);
}
