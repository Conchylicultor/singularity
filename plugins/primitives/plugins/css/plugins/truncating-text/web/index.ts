import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { TruncatingText } from "./internal/truncating-text";
export type {
  TruncatingTextProps,
  TruncateSide,
} from "./internal/truncating-text";

export default {
  description:
    "Single-line text that truncates with an ellipsis instead of wrapping. Bakes in the min-w-0 + truncate pair flexible labels need inside a flex row.",
  contributions: [],
} satisfies PluginDefinition;
