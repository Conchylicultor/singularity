export { ConversationModelSchema } from "./model";
export type { ConversationModel } from "./model";
export { ConversationStatusSchema, isActiveStatus } from "./status";
export type { ConversationStatus } from "./status";
export {
  ConversationSchema,
  conversationsResource,
} from "@plugins/tasks-core/server";
export type { Conversation } from "@plugins/tasks-core/server";

import {
  getConversationRuntime,
  getConversationClaudeSessionId,
} from "@plugins/tasks-core/server";
import {
  findTranscriptPath,
  readTurns,
  type Turn,
} from "./internal/claude-transcript";

export type { Turn };

export interface RuntimeInfo {
  title: string;
  working: boolean;
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
      model?: import("./model").ConversationModel;
      spawnedBy?: string | null;
    },
  ): Promise<void>;
  delete(conversationId: string): Promise<void>;
  list(): Promise<Map<string, RuntimeInfo>>;
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

export { createConversation, deleteConversation } from "./internal/lifecycle";

export async function getConversationRow(id: string): Promise<{
  status: string;
  runtime: string;
  claudeSessionId: string | null;
} | null> {
  return getConversationRuntime(id);
}

export async function readConversationTurns(
  id: string,
  since?: string,
): Promise<Turn[]> {
  const claudeSessionId = await getConversationClaudeSessionId(id);
  if (!claudeSessionId) return [];
  const path = await findTranscriptPath(claudeSessionId);
  if (!path) return [];
  return readTurns(path, since);
}
