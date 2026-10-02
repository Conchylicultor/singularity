import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type {
  BreakdownDecl,
  BreakdownEvaluate,
  DeclParams,
  DrillPage,
  Interval,
  MetricDecl,
  MetricEvaluate,
  MetricSourceDecl,
} from "../../core";

/** What a metric's `details` receives: one bucket (or one series of it), one page. */
export interface DetailsCtx<P> {
  interval: Interval;
  /** The split dimension and key the user picked; null = every record in the interval. */
  split: { id: string; key: string } | null;
  params: P;
  cursor: string | null;
  limit: number;
}

export type MetricDetails<P> = (ctx: DetailsCtx<P>) => Promise<DrillPage>;

// The erased forms the registry holds. Params are `Record<string, unknown>`
// here because the registry holds every metric at once; each call is handed
// the params parsed against THAT metric's own specs, which is the type
// `serveMetric` / `serveBreakdown` checked the evaluator against.
type AnyParams = Record<string, unknown>;

export interface MetricImpl {
  metric: MetricDecl;
  evaluate: MetricEvaluate<AnyParams>;
  details?: MetricDetails<AnyParams>;
}

export interface BreakdownImpl {
  breakdown: BreakdownDecl;
  evaluate: BreakdownEvaluate<AnyParams>;
}

/** Bind a metric declaration to its evaluator (and optional drill-down), typed by its params. */
export function serveMetric<M extends MetricDecl>(
  metric: M,
  impl: {
    evaluate: MetricEvaluate<DeclParams<M>>;
    details?: MetricDetails<DeclParams<M>>;
  },
): MetricImpl {
  return {
    metric,
    evaluate: impl.evaluate as unknown as MetricEvaluate<AnyParams>,
    ...(impl.details !== undefined && {
      details: impl.details as unknown as MetricDetails<AnyParams>,
    }),
  };
}

/** Bind a breakdown declaration to its evaluator, typed by its params. */
export function serveBreakdown<B extends BreakdownDecl>(
  breakdown: B,
  impl: { evaluate: BreakdownEvaluate<DeclParams<B>> },
): BreakdownImpl {
  return {
    breakdown,
    evaluate: impl.evaluate as unknown as BreakdownEvaluate<AnyParams>,
  };
}

export interface SourceImpl {
  source: MetricSourceDecl;
  metrics: readonly MetricImpl[];
  breakdowns?: readonly BreakdownImpl[];
  /**
   * What makes this source's numbers stale: subscribe `bump` to it and return
   * the unsubscribe. Runs only while a browser watches the source's revision.
   * Absent = the numbers change only with the range (nothing to watch).
   */
  changes?: (bump: () => void) => () => void;
}

// One contribution per metric source. Consumers never import a provider: the
// catalog, query and details endpoints read this collection generically.
export const MetricsServer = {
  Source: defineServerContribution<SourceImpl>("metrics.source", {
    docLabel: (s) => s.source.id,
  }),
};
