import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { resolveIconSvgNodes, resolveIconSvgNodesJson } from "./internal/resolve-svg";

export default {
  description: "Searchable, categorized icon picker over the full Material Design set. Owns the SvgNode storage format, the icon registry, and server-side SVG resolution; avatar composes it.",
  contributions: [],
} satisfies ServerPluginDefinition;
