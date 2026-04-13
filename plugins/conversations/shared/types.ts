export type ConversationStatus =
  | "starting"
  | "working"
  | "needs_attention"
  | "completed"
  | "obsolete";

export interface Conversation {
  id: string;
  worktreePath: string;
  title: string | null;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TmuxLive {
  task: string;
  idle: boolean;
}
