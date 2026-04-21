import { resourceDescriptor } from "@core/shared/resource";

export type JobState =
  | { status: "running" }
  | { status: "clean" }
  | { status: "flag"; text: string }
  | { status: "error"; message: string };

export const pushAndExitResource = resourceDescriptor<Record<string, JobState>>(
  "push-and-exit",
);
