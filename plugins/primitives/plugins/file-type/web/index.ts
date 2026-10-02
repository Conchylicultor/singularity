import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { FileTypeIcon } from "./components/file-type-icon";
export type { FileTypeIconProps } from "./components/file-type-icon";

export default {
  description:
    "<FileTypeIcon name isDir? open?/>: a directory as the Material folder in the --folder colour, a file as its Seti glyph tinted by its file-type tone.",
  contributions: [],
} satisfies PluginDefinition;
