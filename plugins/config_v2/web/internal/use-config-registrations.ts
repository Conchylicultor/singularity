import { useContext, useMemo } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";

export interface ConfigRegistration {
  descriptor: ConfigDescriptor;
  pluginId: string;
  pluginName: string;
  storePath: string;
}

export function useConfigRegistrations(): ConfigRegistration[] {
  const ctx = useContext(PluginRuntimeContext);
  if (!ctx) throw new Error("useConfigRegistrations must be inside PluginProvider");

  const raw = ctx.bySlot.get("config-v2.web-register");
  return useMemo(
    () =>
      (raw ?? [])
        .filter((c) => c._pluginId && c._pluginName)
        .map((c) => {
          // The descriptor is stored under its explicit `pluginId` override when
          // present, else the registering plugin's own id.
          const storePluginId =
            ((c.pluginId as string | undefined) ?? c._pluginId) as string;
          return {
            descriptor: c.descriptor as ConfigDescriptor,
            pluginId: c._pluginId as string,
            pluginName: c._pluginName as string,
            storePath: `${storePluginId}/${(c.descriptor as ConfigDescriptor).name}.jsonc`,
          };
        }),
    [raw],
  );
}
