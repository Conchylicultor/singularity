import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Badge,
  type BadgeVariant,
} from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import type { RemountCause, RemountStat } from "../../core";
import { registerExcludedComponent } from "../internal/global-api";

const CAUSE_LABEL: Record<RemountCause, string> = {
  "element-type": "element-type flip",
  "key-change": "key change",
  unknown: "unknown",
};

// element-type flips are the actionable destroy-and-rebuild; key changes info.
function causeVariant(cause: RemountCause): BadgeVariant {
  if (cause === "element-type") return "warning";
  if (cause === "key-change") return "info";
  return "muted";
}

export function RemountRow({ stat }: { stat: RemountStat }) {
  return (
    <Inset x="md" y="sm" as="li">
      <Stack gap="2xs">
        <Text as="div" variant="label">
          {stat.fromType} → {stat.toType}
        </Text>
        {stat.ancestorPath.length > 0 && (
          <Text as="div" variant="caption" tone="muted">
            {stat.ancestorPath.join(" › ")}
          </Text>
        )}
        <Cluster>
          <Badge variant={causeVariant(stat.cause)}>
            {CAUSE_LABEL[stat.cause]}
          </Badge>
          <Badge variant="muted">×{stat.count}</Badge>
        </Cluster>
      </Stack>
    </Inset>
  );
}

// Self-exclusion: the profiler must never attribute its own UI churn. Register
// at module load (before any session can run).
registerExcludedComponent(RemountRow);
