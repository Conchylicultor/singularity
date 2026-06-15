import { useContext, useMemo } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { pluginIdSegments } from "@plugins/framework/plugins/plugin-id/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { storePathOf, storePluginId } from "./store-path";

export interface ConfigRegistration {
  descriptor: ConfigDescriptor;
  /**
   * Canonical DOT-form plugin id this config is *stored* under — the slot-owner
   * when a contribution overrides `pluginId` (e.g. reorder planting each slot's
   * directive under the slot's defining plugin), else the registering plugin.
   * Matches `PluginNode.id`, so the settings tree groups under the owning plugin.
   */
  pluginId: PluginId;
  /** Display label: the store plugin's leaf segment, == its `PluginNode.name`. */
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
        .filter((c) => storePluginId(c))
        .map((c) => {
          // Single chokepoint: pluginId, pluginName, and storePath all derive
          // from storePluginId (the explicit override, else the registering
          // plugin) so the UI grouping can never drift from the on-disk path.
          const id = storePluginId(c)!;
          const segs = pluginIdSegments(id);
          return {
            descriptor: c.descriptor as ConfigDescriptor,
            pluginId: id,
            pluginName: segs.at(-1) ?? id,
            storePath: storePathOf(c)!,
          };
        }),
    [raw],
  );
}
