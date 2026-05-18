import type { Registration } from "@plugins/framework/plugins/server-core/core";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import {
  getConversationRuntime,
  getConversationClaudeSessionId,
} from "@plugins/tasks-core/server";
import { findTranscriptPath } from "@plugins/conversations/plugins/transcript-watcher/server";
import {
  readTurns,
  rewindLastUserTurn,
  type Turn,
} from "./claude-transcript";

export type { Turn };

export interface RuntimeInfo {
  title: string;
  working: boolean;
  dead: boolean;
  claudeSessionId: string | null;
  worktreePath: string;
  waitingFor: string | null;
}

export interface ConversationRuntime {
  readonly id: string;
  create(
    conversationId: string,
    worktreePath: string,
    opts?: {
      prompt?: string;
      model?: ConversationModel;
      resumeSessionId?: string;
      forkSession?: boolean;
    },
  ): Promise<void>;
  delete(conversationId: string): Promise<void>;
  list(): Promise<Map<string, RuntimeInfo>>;
  send(conversationId: string, text: string): Promise<void>;
  interrupt(conversationId: string): Promise<void>;
}

const registry = new Map<string, ConversationRuntime>();

export const Runtime = {
  /**
   * Returns a {@link Registration} token. The actual `registry.set` (and the
   * duplicate-id guard) fire when the framework invokes `.register()` during
   * the plugin register phase. Plugins list the result in their `register`
   * array on `ServerPluginDefinition`.
   */
  define(runtime: ConversationRuntime): Registration {
    return {
      register() {
        if (registry.has(runtime.id)) {
          throw new Error(`Runtime "${runtime.id}" already registered`);
        }
        registry.set(runtime.id, runtime);
      },
    };
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

export async function interruptConversation(id: string): Promise<void> {
  const row = await getConversationRuntime(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  await Runtime.get(row.runtime).interrupt(id);
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

export async function rewindConversationTurn(id: string): Promise<string | null> {
  const claudeSessionId = await getConversationClaudeSessionId(id);
  if (!claudeSessionId) return null;
  const path = await findTranscriptPath(claudeSessionId);
  if (!path) return null;
  return rewindLastUserTurn(path);
}
