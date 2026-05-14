import type { PluginDefinition } from "@core";

export { ContentScope } from "./internal/select-scope";

export default {
  id: "select-scope",
  name: "Select Scope",
  description:
    "Scoped Ctrl+A (Select All) for content containers. Wrap content in <ContentScope> to prevent page-wide selection when focus is inside it.",
  contributions: [],
} satisfies PluginDefinition;
