import type { Report } from "@plugins/reports/core";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { ThemeResolutionPayloadSchema } from "@plugins/reports/plugins/theme-resolution/core";

// One-line Debug → Reports summary for the theme-resolution kind: which fault,
// and the theme (plus scope or group) it is about.
export function ThemeResolutionKindView({ report }: { report: Report }) {
  const parsed = ThemeResolutionPayloadSchema.safeParse(report.data);
  if (!parsed.success) return <>{report.message}</>;
  const d = parsed.data;

  return (
    <Inline gap="xs">
      <Badge variant="warning" mono>
        {d.fault}
      </Badge>
      <span>
        {d.fault === "missing-theme"
          ? `${d.scopeId ?? "desktop"} → ${d.themeId} (painted Default)`
          : d.fault === "unregistered-group"
            ? `${d.themeId} · ${d.groupId}`
            : `${d.themeId} · ${d.groupId}: ${d.tokens.join(", ")}`}
      </span>
    </Inline>
  );
}
