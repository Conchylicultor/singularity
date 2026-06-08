import { useContext } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2Resource } from "@plugins/config_v2/core";
import type { ConfigDescriptor, ConfigValues, FieldsRecord } from "@plugins/config_v2/core";
import { useScopeForked } from "./use-scope-forked";
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
  // A scope only DIFFERS from global when it is forked; an unforked scope
  // resolves server-side to exactly the global value. So we subscribe to the
  // scoped key only when forked, and otherwise reuse the global key. While a
  // forked scope's value is still loading, we fall back to the GLOBAL value
  // (the correct, currently-displayed value) — never `descriptor.defaults`,
  // which was the original flash. All hooks are called unconditionally; only
  // the returned value branches.
  const forked = useScopeForked(opts?.scopeId);
  const scoped = opts?.scopeId && forked;
  const globalRes = useResource(configV2Resource, { path });
  const scopedRes = useResource(
    configV2Resource,
    scoped ? { path, scopeId: opts.scopeId } : { path },
  );

  if (scoped && !scopedRes.pending) return scopedRes.data as ConfigValues<F>;
  if (!globalRes.pending) return globalRes.data as ConfigValues<F>;
  // Unreachable once boot hydration has run; safe fallback if a read races boot.
  return descriptor.defaults as ConfigValues<F>;
}
