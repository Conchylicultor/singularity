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
      toast({
        type: "mutation-error",
        description: getEndpointErrorMessage(event.action.error),
        variant: "warning",
      });
    });
  }, [queryClient]);

  return null;
}
