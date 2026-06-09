import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleCreate } from "./internal/handle-create";
import { handleGet } from "./internal/handle-get";
import { handleSaveFile } from "./internal/handle-save-file";
import { createScreenshot, getScreenshot, saveScreenshotFile } from "../shared/endpoints";

export default {
  description: "Stores in-flight screenshots so a freshly opened tab can fetch them.",
  httpRoutes: {
    [createScreenshot.route]: handleCreate,
    [getScreenshot.route]: handleGet,
    [saveScreenshotFile.route]: handleSaveFile,
  },
} satisfies ServerPluginDefinition;
