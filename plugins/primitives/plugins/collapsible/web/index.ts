import type { PluginDefinition } from "@core";

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "./internal/collapsible";
export type {
  CollapsibleProps,
  CollapsibleTriggerProps,
  CollapsibleContentProps,
  CollapsibleChevronProps,
} from "./internal/collapsible";

export { useCollapsible } from "./internal/use-collapsible";
export type {
  UseCollapsibleOptions,
  UseCollapsibleReturn,
} from "./internal/use-collapsible";

export default {
  id: "collapsible",
  name: "Collapsible",
  description:
    "Accessible collapsible primitive with controlled/uncontrolled support and a built-in chevron indicator. Compound components for standard layouts; useCollapsible hook for custom triggers.",
  contributions: [],
} satisfies PluginDefinition;
