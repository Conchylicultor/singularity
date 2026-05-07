import type { ServerPluginDefinition } from "@server/types";
import { themeEngineConfig } from "../shared";

export default {
  id: "ui-theme-engine",
  name: "UI: Theme Engine",
  config: themeEngineConfig,
} satisfies ServerPluginDefinition;
