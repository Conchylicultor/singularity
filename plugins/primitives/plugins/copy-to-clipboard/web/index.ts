import type { PluginDefinition } from "@core";

export { useCopyToClipboard } from "./internal/use-copy-to-clipboard";
export { CopyButton, type CopyButtonProps } from "./internal/copy-button";

export default {
  id: "copy-to-clipboard",
  name: "Copy to Clipboard",
  description:
    "useCopyToClipboard hook and CopyButton component for the clipboard write + timeout-reset pattern.",
  contributions: [],
} satisfies PluginDefinition;
