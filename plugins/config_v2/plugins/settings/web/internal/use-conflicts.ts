import { useCallback } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import {
  configV2ConflictResource,
  configV2ConflictMapResource,
} from "@plugins/config_v2/core";
import type {
  ConfigV2ConflictEntry,
  ConfigV2ConflictLocations,
  ConfigV2ConflictMap,
} from "@plugins/config_v2/core";

// One descriptor's conflict entry (or null) for the selected scope. Raw gateable
// result — never collapse `pending` into `null` (that hides "still loading" from
// "genuinely no conflict"). Callers gate. `scopeId` selects the scope (undefined
// = Base). Keyed per-path so opening one descriptor recomputes only that one.
export function useConflict(
  storePath: string,
  scopeId?: string,
): ResourceResult<ConfigV2ConflictEntry | null> {
  return useResource(configV2ConflictResource, {
    path: storePath,
    ...(scopeId ? { scopeId } : {}),
  });
}

// Every conflicting storePath mapped to WHERE it conflicts (base and/or named
// app scopes) — the aggregate that makes a scoped-only conflict both visible and
// locatable without opening the descriptor. Gate on `pending` like useConflict.
export function useConflictMap(): ResourceResult<ConfigV2ConflictMap> {
  return useResource(configV2ConflictMapResource, {});
}

// One descriptor's slice of that map, as a stable accessor. `undefined` means
// "no conflict anywhere" — and, while the resource is still pending, "we don't
// know yet", which the badge and banner render as nothing rather than as a claim.
export function useConflictLocationsOf(): (
  storePath: string,
) => ConfigV2ConflictLocations | undefined {
  const res = useConflictMap();
  const map = res.pending ? undefined : res.data;
  return useCallback((storePath: string) => map?.[storePath], [map]);
}
