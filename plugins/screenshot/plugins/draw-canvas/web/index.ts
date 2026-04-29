import type { PluginDefinition } from "@core";

export { DrawCanvas } from "./draw-canvas";
export type { Stroke, DrawCanvasProps } from "./draw-canvas";
export { applyStrokes } from "./apply-strokes";

export default {
  id: "draw-canvas",
  name: "Draw Canvas",
  description:
    "Reusable freehand draw canvas (color/width strokes). Used by the screenshot editor and draw-on-app.",
  contributions: [],
} satisfies PluginDefinition;
