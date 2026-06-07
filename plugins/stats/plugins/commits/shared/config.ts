import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/config_v2/plugins/fields/plugins/list/core";

export const commitsConfig = defineConfig({
  fields: {
    excludedPaths: listField({
      label: "Excluded paths (line stats)",
      description: "File path prefixes excluded from line-change stats.",
      itemFields: {
        path: textField({ label: "Path" }),
        enabled: boolField({ label: "Enabled", default: true }),
      },
      default: [
        { path: "research/", enabled: true },
        { path: "server/src/db/migrations/meta/", enabled: true },
      ],
    }),
    filterRebases: boolField({
      default: false,
      label: "Filter rebases (deduplicate by push)",
    }),
  },
});
