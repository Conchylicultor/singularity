import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
// Side-effect: registers the inline-chip union as a lazy source of every
// `TextEditor`'s token extensions, so a chip renders while composing too.
import "./internal/register-node-source";

export { InlineChip } from "./slots";
export { inlineChip, inlineChips } from "./internal/inline-registry";
export type {
  ChipSurface,
  InlineChipContribution,
} from "./internal/inline-registry";
export { inlineChipExtension } from "./internal/inline-extension";
export { renderInlineChip } from "./internal/render-inline-chip";
export { inlineChipWebNode } from "./internal/inline-chip-node";

import { InlineChip as InlineChipSlots } from "./slots";

export default {
  description:
    "Inline chips for every text surface: inlineChip() declares one (a self-certifying pattern, the surfaces it belongs on, and the component that renders it) and records it in a module registry; one generic Lexical node renders any declared chip, and inlineChipExtension(surface) hands a Lexical host that surface's chips as a single token extension. renderInlineChip(token) is the one rendering of a matched token, inside its own error boundary.",
  contributions: [],
  slots: InlineChipSlots,
} satisfies PluginDefinition;
