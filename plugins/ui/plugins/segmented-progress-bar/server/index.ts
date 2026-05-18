import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Config } from "@plugins/config/server";
import { segmentedProgressBarConfig } from "../core";

export default {
  id: "ui-segmented-progress-bar",
  name: "UI: Segmented Progress Bar",
  contributions: [Config.Field(segmentedProgressBarConfig)],
} satisfies ServerPluginDefinition;
