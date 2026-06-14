export {
  recordSpan,
  recordEntrySpan,
  installSpanContextRuntime,
  installProfilingSuppressionRuntime,
  runWithoutProfiling,
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
