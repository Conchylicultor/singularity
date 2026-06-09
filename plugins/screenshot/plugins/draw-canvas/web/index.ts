import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { DrawCanvas } from "./draw-canvas";
export type { Stroke, DrawCanvasProps } from "./draw-canvas";
export { applyStrokes } from "./apply-strokes";

export default {
  description:
    "Reusable freehand draw canvas (color/width strokes). Used by the screenshot editor and draw-on-app.",
  contributions: [],
} satisfies PluginDefinition;
