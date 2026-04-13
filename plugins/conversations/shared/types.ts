export type ConversationStatus =
  | "starting"
  | "working"
  | "needs_attention"
  | "completed"
  | "obsolete";

export interface Conversation {
  name: string;
  createdAt: string;
  task: string;
  idle: boolean;
  attached: boolean;
  cwd: string;
  title: string | null;
  status: ConversationStatus;
}
