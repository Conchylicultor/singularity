import type { PluginDefinition } from "@core";

export default {
  id: "primitives",
  name: "Primitives",
  description:
    "Umbrella for cross-cutting client-side primitives used by feature plugins: pane router, tree, live state, networking, editable fields, syntax highlighting, launch buttons.",
  contributions: [],
} satisfies PluginDefinition;
