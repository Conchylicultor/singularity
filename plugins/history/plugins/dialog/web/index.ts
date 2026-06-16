import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { VersionHistoryDialog } from "./components/version-history-dialog";
export type { VersionHistoryDialogProps } from "./components/version-history-dialog";
export { useVersionHistory } from "./internal/use-version-history";
export type { UseVersionHistoryOptions } from "./internal/use-version-history";

export default {
  description:
    "Reusable version-history UI: the useVersionHistory hook and the <VersionHistoryDialog> dialog (preview injected via renderPreview, navigation owned by the host).",
  contributions: [],
} satisfies PluginDefinition;
