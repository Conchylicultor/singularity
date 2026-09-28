import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { configScopes, configValues } from "@plugins/config_v2/core";
import type {
  ConfigDescriptor,
  ConfigValues,
  ConfigV2ScopesMap,
} from "@plugins/config_v2/core";
import type { FieldsRecord } from "@plugins/fields/core";
import { useStorePath } from "./use-store-path";

/**
 * The server-registered storePaths as this page first saw them: the keys of the
 * first settled `configScopes` map (normally the boot snapshot's). Fixed for the
 * page's lifetime, like the web registrations it is compared with.
 */
let pageBootPaths: ReadonlySet<string> | null = null;
function registeredAtPageBoot(map: ConfigV2ScopesMap): ReadonlySet<string> {
  pageBootPaths ??= new Set(Object.keys(map));
  return pageBootPaths;
}

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
  const scopeId = opts?.scopeId;

  // Every document is preloaded by the boot snapshot and kept for the tab's
  // lifetime (`configValues` / `configScopes` are `"boot-and-keep"`), so these
  // reads are normally settled on the first render — that is what replaces
  // Suspense here. Not a guarantee: a failed boot snapshot leaves them pending
  // until the WS sub-ack lands, which is exactly the window this hook exposes.
  //
  // `configScopes` lists EVERY server-registered path. Defense-in-depth against
  // the silent half-registration: a descriptor registered on web but missing
  // the matching server ConfigV2.Register is absent from it, so its document
  // would stay pending and `useConfig` would silently answer
  // `descriptor.defaults`. Once the map is known, a missing path is a hard
  // error — judged against the map as this PAGE first saw it (the boot
  // snapshot's): a later push can drop a path because the server changed under
  // an open tab (a deploy that moved the plugin), which is skew, not a wiring
  // bug, and must not crash every reader of it.
  const scopes = useLive(configScopes);
  if (!scopes.pending && !registeredAtPageBoot(scopes.data).has(path)) {
    throw new Error(
      `[config-v2] useConfig: descriptor "${descriptor.name}" is registered on web ` +
        `(storePath "${path}") but the server has no matching ConfigV2.Register — ` +
        `add ConfigV2.Register({ descriptor }) to the plugin's server/index.ts.`,
    );
  }

  // A scope DIFFERS from global only when it has its OWN config on disk — a
  // committed git scope, a runtime theme fork, OR a plain scoped setConfig
  // write — which is exactly membership in `configScopes` (the server publishes
  // it from `scopeHasOwnConfig`, the predicate read/write/server-resolve all
  // key off, so no client re-derivation can drift from it). A member scope reads
  // its own document; any other scope resolves server-side to exactly the
  // global document (and the server never pushes base changes to an untracked
  // scoped tuple), so it reads the global one. The scoped read is SKIPPED
  // (`null`) for a non-member — no second subscription. All hooks run
  // unconditionally (Rules of Hooks); only the returned value branches.
  //
  // Membership is decided on the last-known map (`stale` under a transient
  // error), so an error does not flip a scoped reader back to global.
  const map = scopes.pending ? scopes.stale : scopes.data;
  const member =
    scopeId !== undefined &&
    map !== undefined &&
    (map[path] ?? []).includes(scopeId);
  const globalRes = useLive(configValues, { path });
  const scopedRes = useLive(configValues, member ? { path, scopeId } : null);

  // A member scope's document not settled yet falls back to the GLOBAL value
  // (the value currently on screen), never to defaults — the scope only ever
  // refines the global document.
  const chosen = member && !scopedRes.pending ? scopedRes : globalRes;
  // Which document a SCOPED read resolves to is unknown until the map is (a
  // base read never depends on it): pending — with, as its last-known-good,
  // the document the last-known map chose, if a map was ever known. Memoized,
  // so the pending arm keeps its identity between renders like any read's.
  const waitingOnMap = scopeId !== undefined && scopes.pending;
  const mapPending = useMemo((): ResourceResult<ConfigValues<F>> | null => {
    if (!waitingOnMap || !scopes.pending) return null;
    const stale =
      scopes.stale === undefined
        ? undefined
        : chosen.pending
          ? chosen.stale
          : chosen.data;
    return {
      pending: true,
      error: scopes.error ?? (chosen.pending ? chosen.error : null),
      refetch: scopes.refetch,
      ...(stale === undefined ? {} : { stale: stale as ConfigValues<F> }),
    };
  }, [waitingOnMap, scopes, chosen]);
  return mapPending ?? (chosen as ResourceResult<ConfigValues<F>>);
}

/**
 * The ergonomic config read: the resolved document, with `descriptor.defaults`
 * standing in for the (normally unreachable — preloaded and kept) window
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
