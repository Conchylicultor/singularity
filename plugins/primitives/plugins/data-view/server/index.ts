import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { viewStateDescriptor } from "../shared/view-state-config";

export default {
  description:
    "Registers the data-view saved view-state config_v2 descriptor (per-surface active view, sort, and filter).",
  contributions: [ConfigV2.Register({ descriptor: viewStateDescriptor })],
} satisfies ServerPluginDefinition;
