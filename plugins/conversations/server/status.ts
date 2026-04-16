import { z } from "zod";

export const ConversationStatusSchema = z.enum([
  "starting", // process spawning / worktree warming
  "working", // Claude is computing
  "waiting", // Claude paused for user / permission prompt
  "gone", // process dead (any cause)
]);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

export function isActiveStatus(status: ConversationStatus): boolean {
  return status !== "gone";
}
