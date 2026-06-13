import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { InlineText } from "./internal/inline-text";
export { InlineTextWalkerSlot } from "./internal/slot";
export {
  InlineTextWalkerContext,
  useInlineTextWalker,
} from "./internal/walker-context";
export type {
  InlineTextWalker,
  StackedInlineWalkers,
} from "./internal/walker-context";

export default {
  description:
    "Renders a raw string with every registered inline-text walker (active-data chips, file-links) applied in registry order. Consumers write <InlineText text={…}/>; walkers register via InlineTextWalkerSlot. The string seed makes wrong-order composition structurally impossible.",
  contributions: [],
} satisfies PluginDefinition;
