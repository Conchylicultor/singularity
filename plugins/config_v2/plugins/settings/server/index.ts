import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setConfigField } from "@plugins/config_v2/core";
import { resetConfigField, acknowledgeConflict, deleteOverride, getConfigRawFile } from "../core";
import { handleSetField, handleResetField, handleAcknowledgeConflict, handleDeleteOverride, handleGetRawFile } from "./internal/handlers";

export default {
  name: "Config v2: Settings",
  description: "HTTP endpoints for setting and resetting config_v2 field values.",
  httpRoutes: {
    [setConfigField.route]: handleSetField,
    [resetConfigField.route]: handleResetField,
    [acknowledgeConflict.route]: handleAcknowledgeConflict,
    [deleteOverride.route]: handleDeleteOverride,
    [getConfigRawFile.route]: handleGetRawFile,
  },
} satisfies ServerPluginDefinition;
