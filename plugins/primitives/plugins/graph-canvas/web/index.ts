import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { GraphCanvas } from "./components/graph-canvas";
export type {
  GraphCanvasNode,
  GraphCanvasEdge,
  GraphCanvasEdgeTone,
  GraphCanvasGroup,
  GraphCanvasProps,
} from "./components/graph-canvas";

export default {
  description:
    "Generic dagre+xyflow graph canvas primitive: a pan/zoom/fit viewer with HTML/Tailwind nodes and solid/dashed directed edges, behind a domain-agnostic node/edge API. Read-only by default, with opt-in editor affordances (hover connect handles + onConnect, node/edge action overlays, group-background layers, smoothstep edges).",
  contributions: [],
} satisfies PluginDefinition;
