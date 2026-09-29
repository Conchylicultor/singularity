import {
  useLiveRow,
  type LiveRowResult,
} from "@plugins/network/plugins/live/web";
import type { ResourceError } from "@plugins/primitives/plugins/live-state/web";
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
 * - `failed` — the plugin graph could not be read, so whether it ships collect
 *   is unknown: the section shows the failure with its Retry.
 * - `no` — it does not ship collect, or there is nothing to ask about (the
 *   deployment is gone or unreadable, or its composition name no longer
 *   resolves — the overview and composition sections already say so).
 */
export type ShipsAnalytics =
  | { kind: "pending" }
  | { kind: "failed"; error: ResourceError; refetch: () => Promise<void> }
  | { kind: "yes" }
  | { kind: "no" };

const PENDING: ShipsAnalytics = { kind: "pending" };
const YES: ShipsAnalytics = { kind: "yes" };
const NO: ShipsAnalytics = { kind: "no" };

type DeploymentComposition =
  | { kind: "pending" }
  | { kind: "gone" }
  // The row could not be read: nothing to ask about, like `gone` — the
  // overview section renders the failure with its Retry.
  | { kind: "unreadable" }
  | { kind: "named"; name: string };

function compositionOf(
  deployment: LiveRowResult<Deployment>,
): DeploymentComposition {
  switch (deployment.status) {
    case "loading":
      return { kind: "pending" };
    case "error":
      return { kind: "unreadable" };
    case "ready":
      return deployment.found
        ? { kind: "named", name: deployment.row.compositionId }
        : { kind: "gone" };
  }
}

export function useShipsAnalytics(deploymentId: string): ShipsAnalytics {
  const composition = compositionOf(useLiveRow(deployments, deploymentId));
  const inclusion = useCompositionIncludes(
    composition.kind === "named" ? composition.name : null,
    COLLECT_PLUGIN_ID,
  );

  switch (composition.kind) {
    case "pending":
      return PENDING;
    case "gone":
    case "unreadable":
      return NO;
    case "named":
      switch (inclusion.kind) {
        case "pending":
          return PENDING;
        case "failed":
          return inclusion;
        case "unknown-composition":
          return NO;
        case "ready":
          return inclusion.included ? YES : NO;
      }
  }
}

/**
 * The section gate. `true` while loading: the card shows its own loading state
 * rather than popping in a frame late (the detail-sections contract) — and
 * `true` when the answer failed, so the card can show that failure.
 */
export function useAnalyticsAvailable({
  deploymentId,
}: {
  deploymentId: string;
}): boolean {
  return useShipsAnalytics(deploymentId).kind !== "no";
}
