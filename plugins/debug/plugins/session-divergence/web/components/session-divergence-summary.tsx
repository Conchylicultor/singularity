import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { SessionDivergencePayloadSchema } from "../../core";

// One-line divergence summary for the Debug → Reports list, e.g.
// "`conv-1783448623-h424` talking in `af01a393` — 12h ahead of chain tail
// `3f2c…`". The conversation id renders as a warning-colored mono chip; the
// session ids are shortened to their first segment (the full ids live in the
// filed task) so the row stays readable at list width.
export function SessionDivergenceSummary({ report }: { report: Report }) {
  const parsed = SessionDivergencePayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.conversationId}
      </Badge>
      <span>
        talking in {shortId(d.liveSubtreeSessionId)} —{" "}
        {formatLead(d.liveMtimeMs - d.tailMtimeMs)} ahead of chain tail{" "}
        {shortId(d.chainTailSessionId)}
      </span>
    </Inline>
  );
}

function shortId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

function formatLead(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 120) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}
