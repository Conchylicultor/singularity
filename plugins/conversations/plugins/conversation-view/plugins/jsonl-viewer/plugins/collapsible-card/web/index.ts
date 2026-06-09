import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  CollapsibleCard,
  type CollapsibleCardProps,
  type CollapsibleCardTone,
} from "./components/collapsible-card";

export default {
  name: "JSONL Viewer: collapsible card",
  collapsed: true,
  description:
    "Disclosure-card primitive: chevron trigger, optional sibling file path (never nested), and a collapsible body, in muted or primary tone.",
  contributions: [],
} satisfies PluginDefinition;
