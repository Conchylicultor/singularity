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

// Scalar invalidation tick for the Reports list and detail pane. The `reports`
// table is excluded from the change feed (a crash storm UPDATEs its hot rows
// thousands of times a minute), so nothing pushes rows. Instead the server holds
// an in-process counter it bumps after a durable write that would change what a
// reader sees, and pushes it at most once per debounce window. Readers keep it OUT
// of their query key and refetch the page / row in place when `rev` moves (the
// `runs.revision` precedent). In memory: after a restart it reads 0 again, and a
// freshly mounted reader fetches over HTTP anyway.
export const reportsRevisionResource = resourceDescriptor<{ rev: number }>(
  "reports.revision",
  z.object({ rev: z.number().int() }),
  { rev: 0 },
);
