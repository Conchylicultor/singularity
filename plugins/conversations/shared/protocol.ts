export type ConversationEvent =
  | { type: "title"; id: string; title: string | null }
  | { type: "tmux"; id: string; task: string; idle: boolean }
  | { type: "tmux"; id: string; gone: true };
