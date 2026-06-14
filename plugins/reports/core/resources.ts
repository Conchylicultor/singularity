import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// Web-safe view of a report row. Generic columns only — the per-kind payload
// lives in `data` (validated server-side by each kind's ReportKindSpec.schema),
// and kind-specific rendering is delegated to the matching Reports.KindView.
export const ReportSchema = z.object({
  id: z.string(),
  kind: z.string(),
  fingerprint: z.string(),
  worktree: z.string(),
  source: z.string(),
  message: z.string(),
  url: z.string().nullable(),
  userAgent: z.string().nullable(),
  data: z.record(z.unknown()),
  count: z.number().int(),
  rateLimited: z.boolean(),
  noise: z.boolean(),
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
