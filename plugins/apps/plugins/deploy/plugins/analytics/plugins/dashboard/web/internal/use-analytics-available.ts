import {
  useLiveRow,
  type LiveRowResult,
} from "@plugins/network/plugins/live/web";
import { useCompositionIncludes } from "@plugins/plugin-meta/plugins/composition/web";
import {
  deployments,
  type Deployment,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import { COLLECT_PLUGIN_ID } from "./collect-plugin-id";

/**
 * Does this deployment's software record visits? Decided from the resolved
 * closure of the composition it ships — whether it includes the collect plugin
 * — never from the composition's name.
 *
 * - `pending` — the deployment row or the plugin graph is still loading.
 * - `no` — it does not ship collect, or there is nothing to ask about (the
 *   deployment is gone, or its composition name no longer resolves — the
 *   overview and composition sections already say so).
 */
export type ShipsAnalytics = "pending" | "yes" | "no";

type DeploymentComposition =
  { kind: "pending" } | { kind: "gone" } | { kind: "named"; name: string };

function compositionOf(
  deployment: LiveRowResult<Deployment>,
): DeploymentComposition {
  if (deployment.pending) return { kind: "pending" };
  return deployment.found
    ? { kind: "named", name: deployment.row.compositionId }
    : { kind: "gone" };
}

export function useShipsAnalytics(deploymentId: string): ShipsAnalytics {
  const composition = compositionOf(useLiveRow(deployments, deploymentId));
  const inclusion = useCompositionIncludes(
    composition.kind === "named" ? composition.name : null,
    COLLECT_PLUGIN_ID,
  );

  switch (composition.kind) {
    case "pending":
      return "pending";
    case "gone":
      return "no";
    case "named":
      switch (inclusion.kind) {
        case "pending":
          return "pending";
        case "unknown-composition":
          return "no";
        case "ready":
          return inclusion.included ? "yes" : "no";
      }
  }
}

/**
 * The section gate. `true` while loading: the card shows its own loading state
 * rather than popping in a frame late (the detail-sections contract).
 */
export function useAnalyticsAvailable({
  deploymentId,
}: {
  deploymentId: string;
}): boolean {
  return useShipsAnalytics(deploymentId) !== "no";
}
