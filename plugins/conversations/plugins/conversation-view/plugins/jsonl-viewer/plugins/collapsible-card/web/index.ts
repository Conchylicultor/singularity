import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  CollapsibleCard,
  CardHeaderAction,
  type CollapsibleCardProps,
} from "./components/collapsible-card";

export default {
  collapsed: true,
  description:
    "Disclosure-card primitive: chevron trigger, optional interactive sibling aside (never nested), and a collapsible body. One uniform chrome; semantic accents live in the label, the error flag, and the call-site className. Pure chrome — it depends on no domain component.",
  contributions: [],
} satisfies PluginDefinition;
