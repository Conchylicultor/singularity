import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/notifications/web";

export function MutationErrorWatcher() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.action.type !== "error") return;
      if (event.mutation.options.meta?.suppressError) return;
      // eslint-disable-next-line reactive-server-io/no-reactive-server-io -- reacts to this tab's local mutation cache, not shared live-state.
      toast({
        type: "mutation-error",
        title: "Request failed",
        description: getEndpointErrorMessage(event.action.error),
        variant: "warning",
      });
    });
  }, [queryClient]);

  return null;
}
