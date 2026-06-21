import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";

export function isActiveStatus(status: ConversationStatus): boolean {
  return status !== "done";
}

export function hasLiveProcess(status: ConversationStatus): boolean {
  return status === "starting" || status === "working" || status === "waiting";
}
