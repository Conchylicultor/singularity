import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const CrashSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  worktree: z.string(),
  source: z.string(),
  errorType: z.string().nullable(),
  message: z.string(),
  stack: z.string().nullable(),
  componentStack: z.string().nullable(),
  url: z.string().nullable(),
  userAgent: z.string().nullable(),
  slot: z.string().nullable(),
  label: z.string().nullable(),
  count: z.number().int(),
  crashLoop: z.boolean(),
  noise: z.boolean(),
  taskId: z.string().nullable(),
  firstSeenAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Crash = z.infer<typeof CrashSchema>;

export const crashesResource = resourceDescriptor<Crash[]>(
  "crashes",
  z.array(CrashSchema),
  [],
);
