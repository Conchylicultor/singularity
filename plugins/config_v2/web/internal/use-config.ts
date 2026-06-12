import { useContext } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2Resource } from "@plugins/config_v2/core";
import type { ConfigDescriptor, ConfigValues, FieldsRecord } from "@plugins/config_v2/core";
import { useScopeForked } from "./use-scope-forked";
import { storePathOf } from "./store-path";
import { useKnownServerPaths } from "./server-paths";
import { useHasCommittedScope } from "./committed-scopes";

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
  // A scope DIFFERS from global only when it has its own config: a committed git
  // scope (known from the boot snapshot) or a runtime user fork (useScopeForked).
  // Both are boot-hydrated and live-tracked server-side, so we subscribe to the
  // scoped key for them. An untracked scope resolves server-side to exactly the
  // global value — and the server never pushes base changes to an untracked
  // scoped key — so for it we reuse the live global key. While a scoped value is
  // still loading, we fall back to the GLOBAL value (the correct currently-shown
  // value), never `descriptor.defaults` (the original flash). All hooks run
  // unconditionally; only the returned value branches.
  const scopeId = opts?.scopeId;
  const forked = useScopeForked(scopeId);
  const hasCommittedScope = useHasCommittedScope(path, scopeId);
  const useScoped = !!scopeId && (forked || hasCommittedScope);
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
