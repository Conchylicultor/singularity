import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2ScopeForkedResource } from "@plugins/config_v2/core";

// Whether the given scope is forked (has @app/<id> override files on disk).
// Returns false when scopeId is undefined (base/global tracks live, never forked).
export function useScopeForked(scopeId?: string): boolean {
  // The resource requires a scopeId param; when absent we still call the hook
  // (Rules of Hooks) but with a placeholder and ignore the result.
  const result = useResource(configV2ScopeForkedResource, { scopeId: scopeId ?? "" });
  if (!scopeId) return false;
  if (result.pending) return false;
  return result.data.forked;
}
