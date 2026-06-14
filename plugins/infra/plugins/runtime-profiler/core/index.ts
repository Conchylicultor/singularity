export {
  recordSpan,
  recordEntrySpan,
  installSpanContextRuntime,
  getRuntimeProfile,
  resetRuntimeProfile,
  onSlowSpan,
} from "./recorder";
export type {
  SpanKind,
  SpanRef,
  SlowSpan,
  SlowSpanHandler,
  Aggregate,
  ParentBreakdown,
} from "./recorder";
