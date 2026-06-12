import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

export const taskDraftConfig = defineConfig({
  fields: {
    captureUrlByDefault: boolField({
      default: true,
      label: "Pre-check URL capture",
      description:
        "When drafting a task from inside an app, pre-check the “URL” capture toggle so the current page URL is attached as task context. Apps where you author tasks rather than inspect subject matter (e.g. the Agent Manager) override this to false per-app.",
    }),
  },
});
