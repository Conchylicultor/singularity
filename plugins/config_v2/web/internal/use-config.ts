import { useContext } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2Resource } from "@plugins/config_v2/core";
import type { ConfigDescriptor, ConfigValues, FieldsRecord } from "@plugins/config_v2/core";
import { useScopeForked } from "./use-scope-forked";

export function useConfig<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  opts?: { scopeId?: string },
): ConfigValues<F> {
  const ctx = useContext(PluginRuntimeContext);
  if (!ctx) throw new Error("useConfig must be inside PluginProvider");

  const registrations = ctx.bySlot.get("config-v2.web-register") ?? [];
  const reg = registrations.find((c) => c.descriptor === descriptor);
  if (!reg?._pluginId) {
    throw new Error(
      `[config-v2] useConfig: descriptor "${descriptor.name}" has no web registration. ` +
        `Add ConfigV2.WebRegister({ descriptor }) to your plugin's web contributions.`,
    );
  }
  const path = `${reg._pluginId}/${descriptor.name}.jsonc`;

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
