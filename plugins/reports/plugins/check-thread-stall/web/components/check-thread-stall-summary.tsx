import type { Report } from "@plugins/reports/core";
import {
  CheckThreadStallPayloadSchema,
  checkThreadStallMessage,
} from "../../core";

// One-line summary for the Debug → Reports list, e.g.
// "check thread stalled 4.2 s — check plugin-boundaries (blocking-io)". The
// same sentence the row's message carries, derived from the payload so a row
// filed before a wording change still reads in today's words.
export function CheckThreadStallSummary({ report }: { report: Report }) {
  const parsed = CheckThreadStallPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  return <>{checkThreadStallMessage(parsed.data)}</>;
}
