import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { WebsiteApps } from "@plugins/apps/plugins/website/plugins/pillars/plugins/apps/web";
import { EditorToySection } from "./components/editor-toy";

export default {
  description:
    "Interactive in-memory block-editor toy on the Apps pillar page: a real <BlockEditor> running non-persisting (React state only, no server rows), with a curated text-block palette and a Reset-to-reseed control — the Pages editor, playable in the browser.",
  contributions: [
    WebsiteApps.Section({
      id: "editor-toy",
      label: "Live editor demo",
      component: EditorToySection,
    }),
  ],
} satisfies PluginDefinition;
