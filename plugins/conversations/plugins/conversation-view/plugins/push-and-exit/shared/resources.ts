import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const JobStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("running") }),
  z.object({ status: z.literal("clean") }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

export type JobState =
  | { status: "running" }
  | { status: "clean" }
  | { status: "error"; message: string };

export const pushAndExitResource = resourceDescriptor<Record<string, JobState>>(
  "push-and-exit",
  z.record(JobStateSchema),
  {},
);
