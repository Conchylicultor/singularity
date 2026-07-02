import { lazyComponent } from "@plugins/primitives/plugins/lazy-component/web";
import type { GraphCanvasProps } from "./graph-canvas-impl";

export type {
  GraphCanvasNode,
  GraphCanvasEdge,
  GraphCanvasEdgeTone,
  GraphCanvasGroup,
  GraphCanvasProps,
} from "./graph-canvas-impl";

/**
 * The real implementation statically imports `dagre` + `@xyflow/react`
 * (~256KB); lazily loading it here keeps that weight off the eager
 * plugin-boot wave and only pulls it in when a graph canvas actually mounts.
 */
export const GraphCanvas = lazyComponent<GraphCanvasProps>(() =>
  import("./graph-canvas-impl").then((m) => ({ default: m.GraphCanvas })),
);
