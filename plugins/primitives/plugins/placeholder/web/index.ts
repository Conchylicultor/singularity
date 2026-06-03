import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Placeholder } from "./internal/placeholder";
export type { PlaceholderProps } from "./internal/placeholder";

export default {
  name: "Placeholder",
  description:
    "Muted text placeholder for loading, empty, and error states. Props: children, tone (muted | error).",
  contributions: [],
} satisfies PluginDefinition;
