import { z } from "zod";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { JobStateSchema, type JobState } from "../../shared/resources";

type Status = JobState["status"];

const store = new Map<string, JobState>();

function toJobState(status: Status, detail: string | null): JobState {
  switch (status) {
    case "running":
      return { status: "running" };
    case "clean":
      return { status: "clean" };
    case "flag":
      return { status: "flag", text: detail ?? "" };
    case "error":
      return { status: "error", message: detail ?? "" };
  }
}

export const pushAndExitResource = defineResource({
  key: "push-and-exit",
  mode: "push",
  schema: z.record(JobStateSchema),
  loader: (): Record<string, JobState> => Object.fromEntries(store),
});

export function setStatus(
  conversationId: string,
  status: Status,
  detail: string | null,
): void {
  store.set(conversationId, toJobState(status, detail));
  pushAndExitResource.notify();
}

export function hasRunning(conversationId: string): boolean {
  return store.get(conversationId)?.status === "running";
}

export function clearJob(conversationId: string): void {
  store.delete(conversationId);
  pushAndExitResource.notify();
}

export function startJob(conversationId: string): void {
  store.set(conversationId, { status: "running" });
  pushAndExitResource.notify();
}
