import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  ViewportEscapePayloadSchema,
  type ViewportEscapePayload,
} from "@plugins/reports/plugins/viewport-escape/core";

// One-line Debug → Reports summary for the viewport-escape kind: which promise
// broke, what lost it, and the element that took it away. No trace — this is a
// CSS ancestor chain in one browser, not a server flight window.
//
// Keyed on the payload union, so a fault kind added to the schema cannot ship
// without a chip label.
const LABEL: Record<ViewportEscapePayload["fault"], string> = {
  "viewport-containing-block": "clipped",
  "viewport-stacking-context": "under chrome",
};

export function ViewportEscapeKindView({ report }: { report: Report }) {
  const parsed = ViewportEscapePayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {LABEL[d.fault]}
      </Badge>
      <span className="truncate" title={d.subject}>
        {d.subject}
      </span>
      <span className="text-muted-foreground truncate" title={d.message}>
        blocked by {d.blocker}
      </span>
    </Inline>
  );
}
