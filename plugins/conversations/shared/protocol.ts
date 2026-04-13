import type { Conversation } from "./types";

export type ConversationEvent =
  | { type: "created"; conversation: Conversation }
  | { type: "deleted"; id: string }
  | { type: "title"; id: string; title: string | null }
  | { type: "tmux"; id: string; task: string; idle: boolean }
  | { type: "tmux"; id: string; gone: true };
