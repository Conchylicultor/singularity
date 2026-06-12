import { useCallback } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2ScopeForkedResource } from "@plugins/config_v2/core";
import type { ConfigV2ScopeForked } from "@plugins/config_v2/core";

// Whether the given scope is forked (has @app/<id> override files on disk).
// Returns false when scopeId is undefined (base/global tracks live, never forked).
//
// `false`-while-pending is the documented-correct fallback here, not a hidden
// collapse: useConfig deliberately falls back to the GLOBAL value while a scoped
// read loads (an unforked scope resolves server-side to exactly the global
// value). So this is an honest derived point read — done via `select` (the
// no-pending-data-collapse carve-out), which keeps the boolean API and re-renders
// reliably on the false→true flip (resource initialData is `{ forked: false }`).
export function useScopeForked(scopeId?: string): boolean {
  const select = useCallback((d: ConfigV2ScopeForked) => d.forked, []);
  // The resource requires a scopeId param; when absent we still call the hook
  // (Rules of Hooks) but with a placeholder and ignore the result.
  const result = useResource(
    configV2ScopeForkedResource,
    { scopeId: scopeId ?? "" },
    { select },
  );
  if (!scopeId) return false;
  if (result.pending) return false;
  return result.data;
}
