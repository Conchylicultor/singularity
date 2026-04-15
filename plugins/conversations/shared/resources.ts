import type { Conversation } from "./types";

export type ConversationEntry = Conversation;

// Mirrors `resourceDescriptor` from @core (plugin-core is web-only; this
// module is shared with the server, which can't import from it).
function descriptor<T>(key: string) {
  return { key } as {
    readonly key: string;
    readonly __types?: { value: T; params: Record<string, never> };
  };
}

export const conversationsResource = descriptor<ConversationEntry[]>("conversations");
