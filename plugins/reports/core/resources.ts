import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const ReportSchema = z.object({
  id: z.string(),
  kind: z.string(),
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
  // Slow-op fields — NULL for crash rows.
  operationKind: z.string().nullable(),
  operation: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  thresholdMs: z.number().int().nullable(),
  lastClientId: z.string().nullable(),
  lastBuildId: z.string().nullable(),
  taskId: z.string().nullable(),
  firstSeenAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Report = z.infer<typeof ReportSchema>;

export const reportsResource = resourceDescriptor<Report[]>(
  "reports",
  z.array(ReportSchema),
  [],
);
