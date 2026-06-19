import { useCallback } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2ScopesResource } from "@plugins/config_v2/core";
import type { ConfigDescriptor, ConfigV2ScopesMap } from "@plugins/config_v2/core";
import type { FieldsRecord } from "@plugins/fields/core";
import { useStorePath } from "./use-store-path";

// Whether the given scope has its OWN config for this descriptor — a committed
// git scope, a runtime fork, OR a plain scoped write. This is the single
// boot-hydrated membership signal `useConfig` keys off (`configV2ScopesResource`,
// one global map keyed `{}`, recomputed server-side from `scopeHasOwnConfig`). It
// replaces the deprecated forked gate: read and theme now share one source of
// truth, so they can never disagree (no "few seconds" global→app flash).
//
// Returns false when scopeId is undefined (base/global is never "a member of
// itself"). `false`-while-pending is the documented-correct fallback (the same
// carve-out useConfig uses): a non-member scope resolves to exactly the global
// value, so falling back to "not a member" matches what is shown; the false→true
// flip on membership re-renders. Committed scopes' membership is boot-hydrated,
// so they read true on the first frame. Done via `select` (the
// no-pending-data-collapse carve-out) to keep a stable boolean API.
export function useScopeMembership<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  scopeId?: string,
): boolean {
  const path = useStorePath(descriptor);
  const inScope = useCallback(
    (map: ConfigV2ScopesMap) => (scopeId ? (map[path] ?? []).includes(scopeId) : false),
    [scopeId, path],
  );
  const result = useResource(configV2ScopesResource, {}, { select: inScope });
  if (!scopeId) return false;
  if (result.pending) return false;
  return result.data;
}
