import type { Conversation, ConversationStatus } from "./types";

export type ConversationEvent =
  | { type: "created"; conversation: Conversation }
  | { type: "deleted"; id: string }
  | { type: "title"; id: string; title: string | null }
  | { type: "claude-session"; id: string; claudeSessionId: string | null }
  | { type: "status"; id: string; status: ConversationStatus }
  | { type: "working"; id: string; working: boolean }
  | { type: "gone"; id: string };
