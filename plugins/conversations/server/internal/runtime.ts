import {
  getConversationRuntime,
  getConversationClaudeSessionId,
} from "@plugins/tasks-core/server";
import {
  findTranscriptPath,
  readTurns,
  type Turn,
} from "./claude-transcript";

export type { Turn };

export interface RuntimeInfo {
  title: string;
  working: boolean;
  dead: boolean;
  claudeSessionId: string | null;
  worktreePath: string;
}

export interface ConversationRuntime {
  readonly id: string;
  create(
    conversationId: string,
    worktreePath: string,
    opts?: {
      prompt?: string;
      model?: import("../schema").ConversationModel;
      spawnedBy?: string | null;
      resumeSessionId?: string;
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

export async function sendTurn(id: string, text: string): Promise<void> {
  const row = await getConversationRuntime(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  await Runtime.get(row.runtime).send(id, text);
}

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
