import type { PluginDefinition } from "@core";

export { InlinePopover, type InlinePopoverProps } from "./internal/inline-popover";

export default {
  id: "primitives/popover",
  name: "InlinePopover",
  description:
    "Single-import wrapper for the Popover + Trigger + Content pattern with sensible defaults.",
  contributions: [],
} satisfies PluginDefinition;
