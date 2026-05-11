import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const JobStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("running") }),
  z.object({ status: z.literal("clean") }),
  z.object({ status: z.literal("flag"), text: z.string() }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

export type JobState =
  | { status: "running" }
  | { status: "clean" }
  | { status: "flag"; text: string }
  | { status: "error"; message: string };

export const pushAndExitResource = resourceDescriptor<Record<string, JobState>>(
  "push-and-exit",
  z.record(JobStateSchema),
  {},
);
