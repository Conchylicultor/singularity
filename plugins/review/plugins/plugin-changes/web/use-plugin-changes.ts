import { useQuery } from "@tanstack/react-query";
import type { PluginChangesResponse } from "../core/protocol";

export function usePluginChanges(conversationId: string) {
  return useQuery<PluginChangesResponse>({
    queryKey: ["review", "plugin-changes", conversationId],
    queryFn: async () => {
      const res = await fetch(
        `/api/review/plugin-changes?conversationId=${encodeURIComponent(conversationId)}`,
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || res.statusText);
      }
      return res.json() as Promise<PluginChangesResponse>;
    },
  });
}
