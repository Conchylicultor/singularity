import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { Source } from "@plugins/review/web";
import { getPluginChanges } from "../core/endpoints";
import type { PluginChangesResponse } from "../core/protocol";

export function usePluginChanges(conversationId: string, source: Source) {
  const pushId = source.kind === "push" ? source.pushId : undefined;
  const result = useEndpoint(getPluginChanges, {}, {
    query: { conversationId, pushId },
  });
  return result as typeof result & { data: PluginChangesResponse | undefined };
}
