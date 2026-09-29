import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { ResourceErrorPayloadSchema } from "../../core";

// One-line Debug → Reports summary for the resource-error kind: the failure
// kind, the resource key, and the message.
export function ResourceErrorKindView({ report }: { report: Report }) {
  const parsed = ResourceErrorPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;
  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.errorKind}
      </Badge>
      <span className="truncate font-mono" title={d.key}>
        {d.key}
      </span>
      <span className="truncate text-muted-foreground" title={d.message}>
        {d.message}
      </span>
    </Inline>
  );
}
