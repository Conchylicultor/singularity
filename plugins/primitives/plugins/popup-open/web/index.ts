import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { PopupOpenScope, useReportPopupOpen } from "./internal/popup-open";

export default {
  description:
    "Typed 'is a popup open inside me' signal: PopupOpenScope aggregates every popup opened under it and hands the boolean to its render-prop child; ui-kit's Root wrappers publish it via useReportPopupOpen. Replaces CSS selectors that named a popup library's own attribute contract. Sits below ui-kit (imports only react) so ui-kit can consume it without a cycle.",
  contributions: [],
} satisfies PluginDefinition;
