import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { CodeWithLineNumbers } from "./components/code-with-line-numbers";

export default {
  name: "JSONL Viewer: Code listing",
  collapsed: true,
  description:
    "Renders `cat -n`-formatted file content with syntax highlighting and a line-number gutter. Shared by the Read tool renderer and the edited-file attachment renderer.",
  contributions: [],
} satisfies PluginDefinition;
