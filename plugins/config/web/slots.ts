import { useContext, type ComponentType } from "react";
import { PluginRuntimeContext, defineSlot } from "@core";
import type { ConfigDescriptor } from "@plugins/config/shared";

export const Config = {
  /**
   * Plugin config contribution. Pass the descriptor returned by `defineConfig`
   * directly — the framework annotates the contribution with the enclosing
   * plugin's id/name/description.
   */
  Spec: defineSlot<ConfigDescriptor>("config.spec"),
  /**
   * Escape hatch for structured settings whose shape doesn't fit the
   * scalar/`string-list` kinds. The contributed component is rendered inside
   * the plugin's group in the Settings pane, below any `Config.Spec` fields.
   * The plugin owns its own storage (see `plugins/config/CLAUDE.md`).
   */
  Section: defineSlot<{
    id: string;
    title: string;
    description?: string;
    component: ComponentType;
  }>("config.section"),
};

export interface SpecWithPlugin {
  descriptor: ConfigDescriptor;
  pluginId: string;
  pluginName: string;
  pluginDescription?: string;
}

export interface SectionWithPlugin {
  id: string;
  title: string;
  description?: string;
  component: ComponentType;
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

/** Mirror of `useSpecsWithPlugin` for `Config.Section` contributions. */
export function useSectionsWithPlugin(): SectionWithPlugin[] {
  const ctx = useContext(PluginRuntimeContext);
  if (!ctx) {
    throw new Error("useSectionsWithPlugin must be used within PluginProvider");
  }
  const raw = ctx.bySlot.get("config.section") ?? [];
  return raw
    .map((c): SectionWithPlugin | null => {
      const pluginId = c._pluginId;
      const pluginName = c._pluginName;
      if (!pluginId || !pluginName) return null;
      return {
        id: c.id as string,
        title: c.title as string,
        description: c.description as string | undefined,
        component: c.component as ComponentType,
        pluginId,
        pluginName,
        pluginDescription: c._pluginDescription,
      };
    })
    .filter((v): v is SectionWithPlugin => v !== null);
}
