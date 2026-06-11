import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ContentScope, selectScopeProps } from "./internal/select-scope";

export default {
  description:
    "Scoped Ctrl+A (Select All) for content containers. Wrap content in <ContentScope>, or spread selectScopeProps onto any focusable root to make it the scope, to prevent page-wide selection when focus is inside it.",
  contributions: [],
} satisfies PluginDefinition;
