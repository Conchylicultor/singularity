export interface Conversation {
  name: string;
  createdAt: string;
  task: string;
  idle: boolean;
  attached: boolean;
  cwd: string;
}
