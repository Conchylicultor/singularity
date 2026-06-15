import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { GraphCanvas } from "./components/graph-canvas";
export type {
  GraphCanvasNode,
  GraphCanvasEdge,
  GraphCanvasProps,
} from "./components/graph-canvas";

export default {
  description:
    "Generic dagre+xyflow graph canvas primitive: read-only pan/zoom/fit viewer with HTML/Tailwind nodes and solid/dashed directed edges, behind a domain-agnostic node/edge API.",
  contributions: [],
} satisfies PluginDefinition;
