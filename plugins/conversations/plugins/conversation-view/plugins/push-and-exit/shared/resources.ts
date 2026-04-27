import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export type JobState =
  | { status: "running" }
  | { status: "clean" }
  | { status: "flag"; text: string }
  | { status: "error"; message: string };

export const pushAndExitResource = resourceDescriptor<Record<string, JobState>>(
  "push-and-exit",
);
