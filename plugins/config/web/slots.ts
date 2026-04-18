import { useContext } from "react";
import { PluginRuntimeContext, defineSlot } from "@core";
import type { ConfigDescriptor } from "@plugins/config/shared";

export const Config = {
  /**
   * Plugin config contribution. Pass the descriptor returned by `defineConfig`
   * directly — the framework annotates the contribution with the enclosing
   * plugin's id/name/description.
   */
  Spec: defineSlot<ConfigDescriptor>("config.spec"),
};

export interface SpecWithPlugin {
  descriptor: ConfigDescriptor;
  pluginId: string;
  pluginName: string;
  pluginDescription?: string;
}

/**
 * Like `Config.Spec.useContributions()` but preserves the PluginProvider-injected
 * plugin metadata so the Settings pane can render groups labeled by plugin name.
 */
export function useSpecsWithPlugin(): SpecWithPlugin[] {
  const ctx = useContext(PluginRuntimeContext);
  if (!ctx) {
    throw new Error("useSpecsWithPlugin must be used within PluginProvider");
  }
  const raw = ctx.bySlot.get("config.spec") ?? [];
  return raw
    .map((c): SpecWithPlugin | null => {
      const descriptor = c as unknown as ConfigDescriptor;
      const pluginId = c._pluginId;
      const pluginName = c._pluginName;
      if (!pluginId || !pluginName) return null;
      return {
        descriptor,
        pluginId,
        pluginName,
        pluginDescription: c._pluginDescription,
      };
    })
    .filter((v): v is SpecWithPlugin => v !== null);
}
