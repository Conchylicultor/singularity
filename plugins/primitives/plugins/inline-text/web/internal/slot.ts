import { defineSlot, type Slot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType, ReactNode } from "react";

// Registry of inline-text walkers. Each contributor wraps `children` and pushes
// a `(ReactNode) => ReactNode` transform onto the InlineTextWalkerContext (via
// useInlineTextWalker). `<InlineText>` mounts these Components sorted by `order`
// (lower runs first) and seeds the innermost with the raw string. Mirrors
// MarkdownEnhancerSlot — the same ordered-walker model, but for plain text.
export const InlineTextWalkerSlot: Slot<{
  id: string;
  order: number;
  Component: ComponentType<{ children: ReactNode }>;
}> = defineSlot("inline-text.walker");
