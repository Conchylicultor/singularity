import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setConfigField } from "@plugins/config_v2/core";
import { resetConfigField, acknowledgeConflict, deleteOverride, mergeConflict, getConfigRawFile } from "../core";
import { handleSetField, handleResetField, handleAcknowledgeConflict, handleDeleteOverride, handleMergeConflict, handleGetRawFile } from "./internal/handlers";

export default {
  description: "HTTP endpoints for setting and resetting config_v2 field values.",
  httpRoutes: {
    [setConfigField.route]: handleSetField,
    [resetConfigField.route]: handleResetField,
    [acknowledgeConflict.route]: handleAcknowledgeConflict,
    [deleteOverride.route]: handleDeleteOverride,
    [mergeConflict.route]: handleMergeConflict,
    [getConfigRawFile.route]: handleGetRawFile,
  },
} satisfies ServerPluginDefinition;
