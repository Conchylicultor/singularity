import type { ReactNode } from "react";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { AnalyticsDashboard } from "./analytics-dashboard";
import { useShipsAnalytics } from "../internal/use-analytics-available";

/**
 * The section body. It waits on the same answer as the availability gate, so
 * the dashboard — and its SSH request — starts only once the deployment is
 * known to ship analytics. (On `no` the gate has already removed the card.)
 */
export function AnalyticsSection({
  deploymentId,
}: {
  deploymentId: string;
}): ReactNode {
  return useShipsAnalytics(deploymentId) === "yes" ? (
    <AnalyticsDashboard deploymentId={deploymentId} />
  ) : (
    <Loading variant="rows" count={3} />
  );
}
