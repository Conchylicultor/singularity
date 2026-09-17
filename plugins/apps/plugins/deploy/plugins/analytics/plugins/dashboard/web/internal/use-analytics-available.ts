import {
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { useCompositionIncludes } from "@plugins/plugin-meta/plugins/composition/web";
import {
  deploymentsResource,
  type Deployment,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import { COLLECT_PLUGIN_ID } from "./collect-plugin-id";

/**
 * Does this deployment's software record visits? Decided from the resolved
 * closure of the composition it ships — whether it includes the collect plugin
 * — never from the composition's name.
 *
 * - `pending` — the deployment list or the plugin graph is still loading.
 * - `no` — it does not ship collect, or there is nothing to ask about (the
 *   deployment is gone, or its composition name no longer resolves — the
 *   overview and composition sections already say so).
 */
export type ShipsAnalytics = "pending" | "yes" | "no";

type DeploymentComposition =
  { kind: "pending" } | { kind: "gone" } | { kind: "named"; name: string };

function compositionOf(
  deployments: ResourceResult<Deployment[]>,
  deploymentId: string,
): DeploymentComposition {
  if (deployments.pending) return { kind: "pending" };
  const deployment = deployments.data.find((d) => d.id === deploymentId);
  return deployment
    ? { kind: "named", name: deployment.compositionId }
    : { kind: "gone" };
}

export function useShipsAnalytics(deploymentId: string): ShipsAnalytics {
  const composition = compositionOf(
    useResource(deploymentsResource),
    deploymentId,
  );
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
