import type { ConversationStatus } from "../shared";

export const CONV_STATUS_DOT: Record<ConversationStatus, string> = {
  starting: "bg-muted-foreground/60",
  working: "bg-[oklch(0.58_0.1_240)]",
  waiting: "bg-amber-500",
  gone: "bg-muted-foreground/40",
};
