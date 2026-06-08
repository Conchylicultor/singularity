import { useContext, useMemo } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { storePathOf } from "./store-path";

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
        .map((c) => ({
          descriptor: c.descriptor as ConfigDescriptor,
          pluginId: c._pluginId as string,
          pluginName: c._pluginName as string,
          storePath: storePathOf(c)!,
        })),
    [raw],
  );
}
