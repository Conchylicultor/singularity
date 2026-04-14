import type { Conversation } from "./types";

export type ConversationEvent =
  | { type: "created"; conversation: Conversation }
  | { type: "deleted"; id: string }
  | { type: "title"; id: string; title: string | null }
  | { type: "claude-session"; id: string; claudeSessionId: string | null }
  | { type: "idle"; id: string; idle: boolean }
  | { type: "gone"; id: string };
