import { z } from "zod";

export const ConversationStatusSchema = z.enum([
  "starting", // process spawning / worktree warming
  "working", // Claude is computing
  "waiting", // Claude paused for user / permission prompt
  "gone", // process dead, not user-completed — still resumable
  "done", // user explicitly closed
]);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

export function isActiveStatus(status: ConversationStatus): boolean {
  return status !== "done";
}

export function hasLiveProcess(status: ConversationStatus): boolean {
  return status === "starting" || status === "working" || status === "waiting";
}
