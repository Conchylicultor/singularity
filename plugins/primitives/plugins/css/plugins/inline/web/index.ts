import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Inline, type InlineProps } from "./internal/inline";

export default {
  description:
    "Inline-level flow layout primitive: <Inline gap> lays out a baseline-aligned inline-flex row for chips/icons that sit inline in a text run. The inline-level sibling of Stack, delegating to Stack.",
  contributions: [],
} satisfies PluginDefinition;
