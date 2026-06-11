import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  CollapsibleCard,
  CardHeaderAction,
  type CollapsibleCardProps,
  type CollapsibleCardTone,
} from "./components/collapsible-card";

export default {
  collapsed: true,
  description:
    "Disclosure-card primitive: chevron trigger, optional sibling file path (never nested), and a collapsible body, in muted or primary tone.",
  contributions: [],
} satisfies PluginDefinition;
