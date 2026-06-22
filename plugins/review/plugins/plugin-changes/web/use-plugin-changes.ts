import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pluginChangesResource } from "../shared/resources";
import { getPluginChanges } from "../core/endpoints";
import type { PluginChangesResponse } from "../core/protocol";

export type PluginChangesResult =
  | { data: undefined; isPending: true; error: Error | null }
  | { data: PluginChangesResponse | undefined; isPending: false; error: Error | null };

export function useWorktreePluginChanges(conversationId: string): PluginChangesResult {
  const r = useResource(pluginChangesResource, { conversationId });
  if (r.pending) return { data: undefined, isPending: true, error: r.error };
  return { data: r.data, isPending: false, error: r.error };
}

export function usePushPluginChanges(pushId: string): PluginChangesResult {
  const { data, isPending, error } = useEndpoint(getPluginChanges, {}, { query: { pushId } });
  if (isPending) return { data: undefined, isPending: true, error };
  return { data, isPending: false, error };
}
