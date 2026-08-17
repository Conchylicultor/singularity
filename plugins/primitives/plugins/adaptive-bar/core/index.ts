export type { FitItem, FitInput, FitResult } from "./fit";
export { assign } from "./fit";

export type {
  MeasuredWidth,
  WidthCache,
  WidthMeasurement,
  WidthEstimate,
  WriteRefusal,
  WriteResult,
} from "./width-cache";
export {
  emptyWidthCache,
  widthKey,
  widthKeyItemId,
  write,
  staleOthers,
  dropItem,
  estimate,
  inlineWidthsFor,
} from "./width-cache";

export type { DockMove } from "./dock-plan";
export { planMoves } from "./dock-plan";

export type { Span } from "./overflow";
export { overflowPx } from "./overflow";
