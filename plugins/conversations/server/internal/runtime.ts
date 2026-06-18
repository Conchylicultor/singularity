import type { Registration } from "@plugins/framework/plugins/server-core/core";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import {
  getConversationRuntime,
  getConversationClaudeSessionId,
} from "@plugins/tasks/plugins/tasks-core/server";
import { findTranscriptPath } from "@plugins/conversations/plugins/transcript-watcher/server";
import {
  readTurns,
  rewindLastUserTurn,
  type Turn,
} from "./claude-transcript";
import { ensureResumed } from "./lifecycle";

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
  /**
   * Answer a pending interactive prompt form (e.g. AskUserQuestion) by
   * sending `text` as a turn. This is a single ATOMIC operation:
   *   1. dismiss the active prompt form,
   *   2. WAIT until the form has actually cleared,
   *   3. send `text` as a normal turn.
   *
   * The wait in step 2 is load-bearing and the whole reason this is a
   * dedicated runtime method rather than a back-to-back interrupt()+send():
   * dismissing the form is not instantaneous, and if the still-live form is
   * fed the keystrokes it auto-selects a wrong option and fabricates an
   * answer (losing the user's text). Implementers MUST verify the form has
   * cleared before sending, and MUST throw if it never clears rather than
   * sending into a live form.
   */
  answerPrompt(conversationId: string, text: string): Promise<void>;
  /**
   * Dismiss a pending interactive prompt form (e.g. AskUserQuestion) WITHOUT
   * sending any answer. Cancelling the form forces the CLI to flush the
   * buffered assistant `tool_use` to the JSONL transcript so the web UI can
   * render it; the user can then answer from the web form (which goes through
   * {@link answerPrompt}). Implementers MUST verify the form has cleared and
   * MUST throw if it never clears, exactly like {@link answerPrompt}'s
   * dismissal step — they share the same self-healing Escape loop, this method
   * simply stops after the form clears (no answer is sent).
   */
  flushInteractivePrompt(conversationId: string): Promise<void>;
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
  // A queued/meta-prompt turn must never be sent into a dead pane: if the
  // conversation is hibernated, transparently resume it (`claude --resume`)
  // before sending. No-op for live conversations.
  await ensureResumed(id);
  const row = await getConversationRuntime(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  await Runtime.get(row.runtime).send(id, text);
}

export async function interruptConversation(id: string): Promise<void> {
  const row = await getConversationRuntime(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  await Runtime.get(row.runtime).interrupt(id);
}

export async function answerPrompt(id: string, text: string): Promise<void> {
  const row = await getConversationRuntime(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  await Runtime.get(row.runtime).answerPrompt(id, text);
}

export async function flushInteractivePrompt(id: string): Promise<void> {
  const row = await getConversationRuntime(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  await Runtime.get(row.runtime).flushInteractivePrompt(id);
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
