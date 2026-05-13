import type { PluginDefinition } from "@core";

export { Placeholder } from "./internal/placeholder";
export type { PlaceholderProps } from "./internal/placeholder";

export default {
  id: "placeholder",
  name: "Placeholder",
  description:
    "Muted text placeholder for loading, empty, and error states. Props: children, tone (muted | error).",
  contributions: [],
} satisfies PluginDefinition;
