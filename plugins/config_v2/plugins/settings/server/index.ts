import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setConfigField, resetConfigField } from "../core";
import { handleSetField, handleResetField } from "./internal/handlers";

export default {
  id: "config-v2-settings",
  name: "Config v2: Settings",
  description: "HTTP endpoints for setting and resetting config_v2 field values.",
  httpRoutes: {
    [setConfigField.route]: handleSetField,
    [resetConfigField.route]: handleResetField,
  },
} satisfies ServerPluginDefinition;
