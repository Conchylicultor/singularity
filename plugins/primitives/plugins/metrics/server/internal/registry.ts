import {
  paramSpecsToWire,
  type Catalog,
  type MetricSourceDecl,
  type ParamSpecs,
} from "../../core";
import {
  MetricsServer,
  type BreakdownImpl,
  type MetricImpl,
  type SourceImpl,
} from "./contribution";

export type RegistryEntry =
  | { kind: "metric"; impl: MetricImpl; source: SourceImpl; specs: ParamSpecs }
  | {
      kind: "breakdown";
      impl: BreakdownImpl;
      source: SourceImpl;
      specs: ParamSpecs;
    }
  | { kind: "unknown" };

export interface MetricRegistry {
  /** Fixed for the life of the process. */
  readonly catalog: Catalog;
  lookup(id: string): RegistryEntry;
  /** Throws on an unknown id: a source is only ever watched for a metric that names it. */
  source(id: string): SourceImpl;
}

/**
 * Index every contributed source. A duplicate source, metric or breakdown id,
 * a metric contributed under a source it was not declared on, or a `drill`
 * without `details` (or the reverse) throws here,
 * at the first read, rather than one silently shadowing the other.
 */
export function buildMetricRegistry(
  sources: readonly SourceImpl[],
): MetricRegistry {
  const bySource = new Map<string, SourceImpl>();
  const entries = new Map<
    string,
    Exclude<RegistryEntry, { kind: "unknown" }>
  >();

  for (const s of sources) {
    if (bySource.has(s.source.id)) {
      throw new Error(`metrics: source "${s.source.id}" is contributed twice`);
    }
    bySource.set(s.source.id, s);
    for (const impl of s.metrics) {
      const decl = impl.metric;
      assertOwned(s.source, decl.id, decl.source);
      if ((decl.drill === undefined) !== (impl.details === undefined)) {
        throw new Error(
          `metrics: "${decl.id}" must declare \`drill\` exactly when its server implementation has \`details\``,
        );
      }
      if (entries.has(decl.id)) {
        throw new Error(`metrics: id "${decl.id}" is declared twice`);
      }
      entries.set(decl.id, {
        kind: "metric",
        impl,
        source: s,
        specs: pick(s.source.params, decl.params),
      });
    }
    for (const impl of s.breakdowns ?? []) {
      const decl = impl.breakdown;
      assertOwned(s.source, decl.id, decl.source);
      if (entries.has(decl.id)) {
        throw new Error(`metrics: id "${decl.id}" is declared twice`);
      }
      entries.set(decl.id, {
        kind: "breakdown",
        impl,
        source: s,
        specs: pick(s.source.params, decl.params),
      });
    }
  }

  const catalog: Catalog = {
    sources: sources.map((s) => ({
      id: s.source.id,
      label: s.source.label,
      params: paramSpecsToWire(s.source.params),
    })),
    metrics: sources.flatMap((s) =>
      s.metrics.map(({ metric: m }) => ({
        id: m.id,
        source: m.source,
        label: m.label,
        ...(m.description !== undefined && { description: m.description }),
        unit: m.unit,
        polarity: m.polarity,
        measure: m.measure,
        splits: m.splits.map((sp) => ({ id: sp.id, label: sp.label })),
        params: [...m.params],
        ...(m.drill !== undefined && { drill: { label: m.drill.label } }),
      })),
    ),
    breakdowns: sources.flatMap((s) =>
      (s.breakdowns ?? []).map(({ breakdown: b }) => ({
        id: b.id,
        source: b.source,
        label: b.label,
        unit: b.unit,
        order: b.order,
        params: [...b.params],
      })),
    ),
  };

  return {
    catalog,
    lookup: (id) => entries.get(id) ?? { kind: "unknown" },
    source: (id) => {
      const s = bySource.get(id);
      if (s === undefined) throw new Error(`metrics: unknown source "${id}"`);
      return s;
    },
  };
}

function assertOwned(
  source: MetricSourceDecl,
  id: string,
  declaredOn: string,
): void {
  if (declaredOn !== source.id) {
    throw new Error(
      `metrics: "${id}" is declared on source "${declaredOn}" but contributed under "${source.id}"`,
    );
  }
}

function pick(specs: ParamSpecs, names: readonly string[]): ParamSpecs {
  return Object.fromEntries(names.map((n) => [n, specs[n]!]));
}

let registry: MetricRegistry | undefined;

/** The process's registry, built from the collected contributions on first read. */
export function getMetricRegistry(): MetricRegistry {
  registry ??= buildMetricRegistry(MetricsServer.Source.getContributions());
  return registry;
}
