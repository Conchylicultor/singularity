import { useNotificationsChannelStatuses } from "@plugins/primitives/plugins/live-state/web";
import type { HealthStatus } from "@plugins/shell/plugins/health-report/web";
import { connectionHealth } from "./connection-health";

/**
 * The Connection row of the health report: the two notification sockets
 * (this worktree's server, and central), folded into one status. Cheap — a
 * subscription to state the live-state client already holds.
 */
export function useConnectionHealth(): HealthStatus {
  return connectionHealth(useNotificationsChannelStatuses());
}
