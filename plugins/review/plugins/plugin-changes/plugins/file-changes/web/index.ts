import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import { FileChangesSection, hasFiles } from "./components/file-changes-section";
import { FileChangesSummary } from "./components/file-changes-summary";

export default {
  name: "Review: File Changes",
  description: "File-level diff section for per-plugin review cards.",
  contributions: [
    PluginChangesSlots.Section({
      id: "file-changes",
      label: "File Changes",
      component: FileChangesSection,
      summary: FileChangesSummary,
      hasContent: (plugin) => hasFiles(plugin),
    }),
  ],
} satisfies PluginDefinition;
