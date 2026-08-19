import { useCallback } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import {
  configV2Resource,
  configV2ScopesResource,
} from "@plugins/config_v2/core";
import type {
  ConfigDescriptor,
  ConfigValues,
  ConfigV2ScopesMap,
} from "@plugins/config_v2/core";
import type { FieldsRecord } from "@plugins/fields/core";
import { useStorePath } from "./use-store-path";
import { useKnownServerPaths } from "./server-paths";

/**
 * The READINESS-CARRYING config read: `{ pending: true }` until this
 * descriptor's document is actually known, `{ pending: false, data }` after.
 *
 * Use this — not `useConfig` — whenever the config decides **what the surface
 * renders** (which views exist, which items are visible, which mode a control
 * is in). `useConfig` answers a not-yet-known document with
 * `descriptor.defaults`, and a config's defaults are a legitimate value, not a
 * recognisable "unknown": a surface reading them mid-load paints a confident,
 * wrong state (the empty list, the off switch) and then rewrites itself seconds
 * later. Here the unknown window is a state you must render, not a value you
 * can accidentally believe.
 *
 * The pending arm carries `stale` (live-state's last-known-good) whenever a
 * value has been seen before, so a transient error keeps showing truth.
 */
export function useConfigResult<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  opts?: { scopeId?: string },
): ResourceResult<ConfigValues<F>> {
  const path = useStorePath(descriptor);

  // Defense-in-depth against the silent half-registration: a descriptor
  // registered on web but missing the matching server ConfigV2.Register is
  // absent from the boot snapshot, so its resource stays pending and a read
  // would silently fall through to `descriptor.defaults`. Once boot has
  // completed (known !== null) we know the full server-registered set, so a
  // missing path is a hard error rather than a silent degrade. While still
  // booting (known === null) we proceed; the pending arm covers it.
  const known = useKnownServerPaths();
  if (known !== null && !known.has(path)) {
    throw new Error(
      `[config-v2] useConfig: descriptor "${descriptor.name}" is registered on web ` +
        `(storePath "${path}") but the server has no matching ConfigV2.Register — ` +
        `add ConfigV2.Register({ descriptor }) to the plugin's server/index.ts.`,
    );
  }

  // The global value is hydrated into the cache at boot (see the config boot
  // task) and its resource is `resident` (never gc'd), so it is normally settled
  // on first read — that is what replaces Suspense here. It is NOT a guarantee:
  // a failed boot snapshot leaves every path pending until the WS sub-ack lands,
  // which is exactly the window this hook exists to expose.
  //
  // A scope DIFFERS from global only when it has its OWN config on disk — a
  // committed git scope, a runtime theme fork, OR a plain scoped setConfig write.
  // There is a single authoritative signal for all three: `configV2ScopesResource`
  // (one global map keyed `{}`), the live membership the server publishes from
  // `scopeHasOwnConfig` — the exact predicate read/write/server-resolve all key
  // off, so no client re-derivation can drift from it. One subscription is shared
  // by every useConfig/useScopeMembership consumer (a `select` narrows re-renders
  // to this path's membership flip). We read the scoped key iff our scopeId is in
  // this path's list; otherwise an untracked scope resolves
  // server-side to exactly the global value (and the server never pushes base
  // changes to an untracked scoped key), so we reuse the live global key.
  //
  // We read membership through a `select` (the no-pending-data-collapse carve-out,
  // mirroring useScopeMembership): the derived boolean is a sanctioned point read, and
  // false-while-pending is the documented-correct fallback — we fall back to the
  // GLOBAL value (the currently-shown value), never `descriptor.defaults` (the
  // original flash). The false→true flip when the scope IS a member changes the
  // selected slice and re-renders. Committed scopes are boot-hydrated into this
  // resource (see the config boot task), so they paint scoped on the first frame.
  // All hooks run unconditionally (Rules of Hooks); only the returned value branches.
  const scopeId = opts?.scopeId;
  const inScope = useCallback(
    (map: ConfigV2ScopesMap) =>
      scopeId ? (map[path] ?? []).includes(scopeId) : false,
    [scopeId, path],
  );
  const scopesRes = useResource(
    configV2ScopesResource,
    {},
    { select: inScope },
  );
  const useScoped = scopesRes.pending ? false : scopesRes.data;
  const globalRes = useResource(configV2Resource, { path });
  const scopedRes = useResource(
    configV2Resource,
    useScoped ? { path, scopeId } : { path },
  );

  // A scoped read that has not settled yet falls back to the GLOBAL value (the
  // value currently on screen), never to defaults — the scope only ever refines
  // the global document. Pending here therefore means "nothing known at all".
  const res = useScoped && !scopedRes.pending ? scopedRes : globalRes;
  return res as ResourceResult<ConfigValues<F>>;
}

/**
 * The ergonomic config read: the resolved document, with `descriptor.defaults`
 * standing in for the (normally unreachable — boot-hydrated + resident) window
 * where the document is not known yet.
 *
 * **Only for reads whose answer does not change what the user sees as a
 * factual claim about their data** — a spacing token, a cosmetic variant. The
 * moment the value decides whether a surface says "nothing here", which items
 * exist, or whether a destructive mode is on, read `useConfigResult` and render
 * the loading state: defaults are indistinguishable from a real answer, so a
 * consumer cannot tell "the user configured nothing" from "we don't know yet".
 */
export function useConfig<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  opts?: { scopeId?: string },
): ConfigValues<F> {
  const res = useConfigResult(descriptor, opts);
  // Last-known-good beats defaults: under a transient error `stale` still holds
  // the document the server last vouched for.
  return res.pending
    ? (res.stale ?? (descriptor.defaults as ConfigValues<F>))
    : res.data;
}
