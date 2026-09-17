import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { INDEX_SCOPE_SETTINGS, type IndexScopeSetting } from "../core";

const SCOPE_LABEL: Record<IndexScopeSetting, string> = {
  auto: "Auto (full on main or a release, sample in a worktree)",
  full: "Every section",
  sample: "Sample (about 5 % of songs)",
};

export const songIndexConfig = defineConfig({
  fields: {
    scope: enumField({
      label: "Song index scope",
      description:
        "Which sections the chord app loads from its snapshot of the Hooktheory dump. Auto loads every section on main and on a release, and a fixed ~5 % sample in a worktree. A change reloads the index the next time the app is opened or the server restarts.",
      options: INDEX_SCOPE_SETTINGS.map((value) => ({
        value,
        label: SCOPE_LABEL[value],
      })),
      default: "auto",
    }),
  },
});
