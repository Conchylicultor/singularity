import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useCopyToClipboard } from "./internal/use-copy-to-clipboard";
export { CopyButton, type CopyButtonProps } from "./internal/copy-button";

export default {
  name: "Copy to Clipboard",
  description:
    "useCopyToClipboard hook and CopyButton component for the clipboard write + timeout-reset pattern.",
  contributions: [],
} satisfies PluginDefinition;
