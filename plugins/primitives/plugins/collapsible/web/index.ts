import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
  useCollapsibleContext,
} from "./internal/collapsible";
export type {
  CollapsibleProps,
  CollapsibleTriggerProps,
  CollapsibleContentProps,
  CollapsibleChevronProps,
  CollapsibleCtx,
} from "./internal/collapsible";

export { useCollapsible } from "./internal/use-collapsible";
export type {
  UseCollapsibleOptions,
  UseCollapsibleReturn,
} from "./internal/use-collapsible";

export { useExpandAll } from "./internal/use-expand-all";
export type { UseExpandAllReturn } from "./internal/use-expand-all";

export { ExpandAllButton } from "./internal/expand-all-button";
export type { ExpandAllButtonProps } from "./internal/expand-all-button";

export default {
  name: "Collapsible",
  description:
    "Accessible collapsible primitive with controlled/uncontrolled support and a built-in chevron indicator. Compound components for standard layouts; useCollapsible hook for custom triggers.",
  contributions: [],
} satisfies PluginDefinition;
