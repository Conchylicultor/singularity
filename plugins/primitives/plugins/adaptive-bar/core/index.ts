export type { FitItem, FitInput, FitResult } from "./fit";
export { assign, passBudget } from "./fit";

export type {
  ConvergenceEvidence,
  MovedWidth,
  PremiseShift,
  Round,
  RoundItem,
} from "./round-trace";
export {
  describeEvidence,
  isShifted,
  premiseShift,
  pushRound,
  recordMoves,
  summarizeRounds,
} from "./round-trace";

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
