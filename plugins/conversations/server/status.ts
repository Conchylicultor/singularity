import type { ConversationStatus } from "@plugins/tasks-core/core";
export { ConversationStatusSchema, type ConversationStatus } from "@plugins/tasks-core/core";

export function isActiveStatus(status: ConversationStatus): boolean {
  return status !== "done";
}

export function hasLiveProcess(status: ConversationStatus): boolean {
  return status === "starting" || status === "working" || status === "waiting";
}
