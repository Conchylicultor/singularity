import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { AnalyticsQuery } from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";
import {
  queryDeploymentAnalytics,
  type DeploymentAnalyticsResult,
} from "../../core";

/**
 * One report per (deployment, query), fetched once and kept: every range,
 * compare or filter change is a new key; going back to an earlier one shows its
 * cached answer. Nothing refetches on its own — no interval, no window-focus
 * refetch — because each fetch is an SSH session to a remote box. The refresh
 * button calls `refetch`.
 *
 * A POST (the query is a structured body), so it is `useQuery` over
 * `fetchEndpoint` rather than `useEndpoint`, which only takes body-less routes.
 */
export function useDeploymentAnalytics(
  deploymentId: string,
  query: AnalyticsQuery,
): UseQueryResult<DeploymentAnalyticsResult> {
  return useQuery({
    queryKey: ["deploy-analytics", deploymentId, query],
    queryFn: ({ signal }) =>
      fetchEndpoint(
        queryDeploymentAnalytics,
        {},
        { body: { deploymentId, query }, signal },
      ),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
