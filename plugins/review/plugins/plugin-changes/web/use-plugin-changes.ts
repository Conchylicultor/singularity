import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { pluginChanges } from "../shared/resources";
import { getPluginChanges } from "../core";
import type { PluginChangesResponse } from "../core";

export type PluginChangesResult =
  | { data: undefined; isPending: true; error: Error | null }
  | {
      data: PluginChangesResponse | undefined;
      isPending: false;
      error: Error | null;
    };

export function useWorktreePluginChanges(
  conversationId: string,
): PluginChangesResult {
  const r = useLive(pluginChanges, { conversationId });
  if (r.pending) return { data: undefined, isPending: true, error: r.error };
  // Settled: the readiness gate guarantees a value the server vouches for, so
  // the settled arm carries no `error` — it is structurally null here.
  return { data: r.data, isPending: false, error: null };
}

export function usePushPluginChanges(pushId: string): PluginChangesResult {
  const { data, isPending, error } = useEndpoint(
    getPluginChanges,
    {},
    { query: { pushId } },
  );
  if (isPending) return { data: undefined, isPending: true, error };
  return { data, isPending: false, error };
}
