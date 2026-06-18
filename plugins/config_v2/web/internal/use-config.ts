import { useContext, useCallback } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2Resource, configV2ScopesResource } from "@plugins/config_v2/core";
import type { ConfigDescriptor, ConfigValues, ConfigV2Scopes } from "@plugins/config_v2/core";
import type { FieldsRecord } from "@plugins/fields/core";
import { storePathOf } from "./store-path";
import { useKnownServerPaths } from "./server-paths";

export function useConfig<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  opts?: { scopeId?: string },
): ConfigValues<F> {
  const ctx = useContext(PluginRuntimeContext);
  if (!ctx) throw new Error("useConfig must be inside PluginProvider");

  const registrations = ctx.bySlot.get("config-v2.web-register") ?? [];
  const reg = registrations.find((c) => c.descriptor === descriptor);
  const path = reg ? storePathOf(reg) : null;
  if (!path) {
    throw new Error(
      `[config-v2] useConfig: descriptor "${descriptor.name}" has no web registration. ` +
        `Add ConfigV2.WebRegister({ descriptor }) to your plugin's web contributions.`,
    );
  }

  // Defense-in-depth against the silent half-registration: a descriptor
  // registered on web but missing the matching server ConfigV2.Register is
  // absent from the boot snapshot, so its resource stays pending and the read
  // below would silently fall through to `descriptor.defaults`. Once boot has
  // completed (known !== null) we know the full server-registered set, so a
  // missing path is a hard error rather than a silent degrade. While still
  // booting (known === null) we proceed; the defaults race fallback covers it.
  const known = useKnownServerPaths();
  if (known !== null && !known.has(path)) {
    throw new Error(
      `[config-v2] useConfig: descriptor "${descriptor.name}" is registered on web ` +
        `(storePath "${path}") but the server has no matching ConfigV2.Register — ` +
        `add ConfigV2.Register({ descriptor }) to the plugin's server/index.ts.`,
    );
  }

  // Non-suspending. The global value is hydrated into the cache at boot (see the
  // config boot task), so it is never `pending` on first paint — that replaces
  // what Suspense was doing (no flash of default values).
  //
  // A scope DIFFERS from global only when it has its OWN config on disk — a
  // committed git scope, a runtime theme fork, OR a plain scoped setConfig write.
  // There is a single authoritative signal for all three: `configV2ScopesResource`
  // (keyed by `{ path }`), the live per-descriptor list the server publishes from
  // `scopeHasOwnConfig` — the exact predicate read/write/server-resolve all key
  // off, so no client re-derivation can drift from it. We subscribe to the scoped
  // key iff our scopeId is in that list; otherwise an untracked scope resolves
  // server-side to exactly the global value (and the server never pushes base
  // changes to an untracked scoped key), so we reuse the live global key.
  //
  // We read membership through a `select` (the no-pending-data-collapse carve-out,
  // mirroring useScopeForked): the derived boolean is a sanctioned point read, and
  // false-while-pending is the documented-correct fallback — we fall back to the
  // GLOBAL value (the currently-shown value), never `descriptor.defaults` (the
  // original flash). The false→true flip when the scope IS a member changes the
  // selected slice and re-renders. Committed scopes are boot-hydrated into this
  // resource (see the config boot task), so they paint scoped on the first frame.
  // All hooks run unconditionally (Rules of Hooks); only the returned value branches.
  const scopeId = opts?.scopeId;
  const inScope = useCallback(
    (list: ConfigV2Scopes) => (scopeId ? list.includes(scopeId) : false),
    [scopeId],
  );
  const scopesRes = useResource(configV2ScopesResource, { path }, { select: inScope });
  const useScoped = scopesRes.pending ? false : scopesRes.data;
  const globalRes = useResource(configV2Resource, { path });
  const scopedRes = useResource(
    configV2Resource,
    useScoped ? { path, scopeId } : { path },
  );

  if (useScoped && !scopedRes.pending) return scopedRes.data as ConfigValues<F>;
  if (!globalRes.pending) return globalRes.data as ConfigValues<F>;
  // Unreachable once boot hydration has run; safe fallback if a read races boot.
  return descriptor.defaults as ConfigValues<F>;
}
