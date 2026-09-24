import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getAttemptSourceUrl } from "../../core";

/**
 * The page this attempt's task was filed from. A plain query, not a live
 * resource: the URL is written once at task creation and never changes.
 */
export function useAttemptSourceUrl(attemptId: string) {
  return useEndpoint(
    getAttemptSourceUrl,
    { attemptId },
    { staleTime: Infinity },
  );
}
