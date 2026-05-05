import type { PluginDefinition } from "@core";

export { Deploy } from "./slots";

export default {
  id: "deploy",
  name: "Deploy",
  description:
    "Self-hosted deployment platform. Manages remote servers from the UI.",
  contributions: [],
} satisfies PluginDefinition;
