import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  HoverPopover,
  type HoverPopoverApi,
  type HoverPopoverProps,
} from "./internal/hover-popover";

export default {
  description:
    "Hover-opened popover: a controlled ui-kit Popover revealed by pointer hover (open intent delay, grace close while the pointer is on neither the trigger nor the portaled panel), ArrowDown, or a first touch tap; closed by Esc, outside press or focus leaving. The trigger's own click is never intercepted, so a trigger can navigate on click and preview on hover.",
  contributions: [],
} satisfies PluginDefinition;
