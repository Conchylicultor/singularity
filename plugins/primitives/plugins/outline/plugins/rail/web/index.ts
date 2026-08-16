import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { OutlineRail } from "./components/outline-rail";
export type { OutlineRailProps } from "./components/outline-rail";
export type { OutlineEntry } from "../core";

export default {
  description:
    "Notion-style outline rail: a dash per section pinned to the surface's right edge, the current one bright and wide (position from outline/scroll-spy), expanding on hover / focus / tap into the depth-indented outline with click-to-jump. Windows its dashes to the height it has while the panel always lists every entry, so a long document's indicator can never lie.",
  contributions: [],
} satisfies PluginDefinition;
