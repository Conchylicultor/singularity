import { useContext } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import { useSuspenseResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2Resource } from "@plugins/config_v2/core";
import type { ConfigDescriptor, ConfigValues, FieldsRecord } from "@plugins/config_v2/core";

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

  // Omit scopeId entirely when absent — `{ path, scopeId: undefined }` serializes
  // to a different live-state cache key than `{ path }` and would split the cache.
  //
  // Suspends until config is loaded rather than returning default values: the
  // server's resource loader waits for the registry to be ready, so the first
  // value is always fully resolved and consumers can destructure fields safely.
  const data = useSuspenseResource(
    configV2Resource,
    opts?.scopeId ? { path, scopeId: opts.scopeId } : { path },
  );
  return data as ConfigValues<F>;
}
