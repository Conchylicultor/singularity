import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { segmentedProgressBarConfig } from "../core";

export default {
  id: "ui-segmented-progress-bar",
  name: "UI: Segmented Progress Bar",
  contributions: [ConfigV2.Register({ descriptor: segmentedProgressBarConfig })],
} satisfies ServerPluginDefinition;
