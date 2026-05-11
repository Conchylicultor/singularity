import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { segmentedProgressBarConfig } from "../shared";

export default {
  id: "ui-segmented-progress-bar",
  name: "UI: Segmented Progress Bar",
  contributions: [Config.Field(segmentedProgressBarConfig)],
} satisfies ServerPluginDefinition;
