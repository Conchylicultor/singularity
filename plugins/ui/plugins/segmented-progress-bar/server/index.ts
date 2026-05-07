import type { ServerPluginDefinition } from "@server/types";
import { segmentedProgressBarConfig } from "../shared";

export default {
  id: "ui-segmented-progress-bar",
  name: "UI: Segmented Progress Bar",
  config: segmentedProgressBarConfig,
} satisfies ServerPluginDefinition;
