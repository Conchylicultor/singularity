import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { BouncingDots } from "@plugins/primitives/plugins/css/plugins/bouncing-dots/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { bundleRefusalMessage } from "@plugins/release/plugins/bundles/core";
import {
  releaseStateLabel,
  stalenessSentence,
  type ReleaseState,
} from "../../core";
import type { ReleaseInfo } from "../internal/use-release-info";

const DOT_COLOR: Record<ReleaseState, string> = {
  building: "bg-info",
  failed: "bg-destructive",
  none: "bg-muted-foreground",
  "platform-mismatch": "bg-destructive",
  stale: "bg-warning",
  built: "bg-success",
};

/**
 * The full sentence behind the chip — the `title`, because a chip sits in the
 * row's rigid trailing region and cannot hold a refusal. The refusal text is the
 * CLI's own, rendered verbatim: this UI never re-derives shippability, and never
 * paraphrases the one wording `ship` prints.
 */
function tooltipFor(info: ReleaseInfo, state: ReleaseState): string {
  if (state === "building") return "A release of this composition is running.";
  const candidate = info.candidate;
  if (!candidate) return releaseStateLabel(state);

  if (!candidate.resolution.ok) {
    const refusal = bundleRefusalMessage(candidate.resolution.refusal);
    return info.latestRun?.status === "failed" && info.latestRun.error
      ? `${refusal}\n\nThe last build failed: ${info.latestRun.error}`
      : refusal;
  }
  return `${candidate.resolution.binaryName}\n${stalenessSentence(candidate.staleness)}`;
}

/**
 * One deployment's release state as the row's trailing chip.
 *
 * Deliberately one line and no timestamp: `RelativeTime` belongs in the pane,
 * where there is room to say what it is relative to.
 */
export function ReleaseChip({ info }: { info: ReleaseInfo | undefined }): ReactNode {
  const state = info?.state;
  if (!info || !state) return null;

  if (state === "building") {
    return (
      <Badge variant="info" icon={<BouncingDots />} title={tooltipFor(info, state)}>
        {releaseStateLabel(state)}
      </Badge>
    );
  }

  return (
    <Badge
      variant="muted"
      icon={<StatusDot colorClass={DOT_COLOR[state]} />}
      title={tooltipFor(info, state)}
    >
      {releaseStateLabel(state)}
    </Badge>
  );
}
