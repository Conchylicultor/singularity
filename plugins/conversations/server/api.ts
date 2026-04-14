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
  create(conversationId: string, worktreePath: string): Promise<void>;
  delete(conversationId: string): Promise<void>;
  list(): Promise<Map<string, RuntimeInfo>>;
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
