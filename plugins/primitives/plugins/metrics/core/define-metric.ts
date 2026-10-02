import type { ParamSpecs, ParamValues } from "./params";

// Declarations are data: a frozen object the server binds to an evaluator and
// the catalog ships to the browser. Nothing here runs a query.

/**
 * What a number means over time, which decides every legal aggregation:
 * - flow  — sums over time and across splits (stack ok, cumulative ok; tile = range total)
 * - level — a value at a bucket's end; sums across splits only (stack ok, no cumulative; tile = value at range end)
 * - rate  — a ratio / median / distinct count; sums neither way (lines only; tile = the range evaluated as ONE interval)
 */
export type Measure = "flow" | "level" | "rate";
export const MEASURES = ["flow", "level", "rate"] as const;

export type Unit = "count" | "usd" | "seconds" | "percent" | "lines";
export const UNITS = ["count", "usd", "seconds", "percent", "lines"] as const;

/** Which direction is good news: it colours a delta. */
export type Polarity = "up" | "down" | "neutral";
export const POLARITIES = ["up", "down", "neutral"] as const;

export type BreakdownOrder = "value-desc" | "value-asc" | "label";
export const BREAKDOWN_ORDERS = ["value-desc", "value-asc", "label"] as const;

export interface SplitDecl {
  readonly id: string;
  readonly label: string;
}

export interface MetricSourceDecl<
  Id extends string = string,
  P extends ParamSpecs = ParamSpecs,
> {
  readonly kind: "source";
  readonly id: Id;
  readonly label: string;
  readonly params: P;
}

export interface MetricDecl<
  S extends MetricSourceDecl = MetricSourceDecl,
  Pk extends readonly (keyof S["params"] & string)[] =
    readonly (keyof S["params"] & string)[],
> {
  readonly kind: "metric";
  /** Global id, `<source>.<metric>`. */
  readonly id: string;
  readonly source: S["id"];
  readonly label: string;
  readonly description?: string;
  readonly unit: Unit;
  readonly polarity: Polarity;
  readonly measure: Measure;
  readonly splits: readonly SplitDecl[];
  /** The source params this metric reads — a subset of the source's. */
  readonly params: Pk;
  /** Present iff the metric can list the records behind a bucket. */
  readonly drill?: { readonly label: string };
}

export interface BreakdownDecl<
  S extends MetricSourceDecl = MetricSourceDecl,
  Pk extends readonly (keyof S["params"] & string)[] =
    readonly (keyof S["params"] & string)[],
> {
  readonly kind: "breakdown";
  /** Global id, `<source>.<breakdown>`. */
  readonly id: string;
  readonly source: S["id"];
  readonly label: string;
  readonly unit: Unit;
  readonly order: BreakdownOrder;
  readonly params: Pk;
}

/** The typed params an evaluator receives for a metric or breakdown. */
export type DeclParams<D extends MetricDecl | BreakdownDecl> =
  D extends MetricDecl<infer S, infer Pk>
    ? Pick<ParamValues<S["params"]>, Pk[number]>
    : D extends BreakdownDecl<infer S, infer Pk>
      ? Pick<ParamValues<S["params"]>, Pk[number]>
      : never;

const LOCAL_ID = /^[a-z0-9][a-z0-9-]*$/i;

function assertLocalId(what: string, id: string): void {
  if (!LOCAL_ID.test(id)) {
    throw new Error(
      `${what} id "${id}" must be letters, digits and dashes (no dots: the global id is "<source>.<id>")`,
    );
  }
}

function assertParamsOfSource(
  what: string,
  src: MetricSourceDecl,
  params: readonly string[],
): void {
  for (const p of params) {
    if (!Object.hasOwn(src.params, p)) {
      throw new Error(
        `${what}: param "${p}" is not declared by source "${src.id}"`,
      );
    }
  }
  if (new Set(params).size !== params.length) {
    throw new Error(`${what}: a param is listed twice`);
  }
}

export function defineMetricSource<
  const Id extends string,
  const P extends ParamSpecs = Record<never, never>,
>(decl: { id: Id; label: string; params?: P }): MetricSourceDecl<Id, P> {
  assertLocalId("metric source", decl.id);
  return Object.freeze({
    kind: "source",
    id: decl.id,
    label: decl.label,
    params: Object.freeze({ ...(decl.params ?? ({} as P)) }),
  });
}

export function defineMetric<
  S extends MetricSourceDecl,
  const Pk extends readonly (keyof S["params"] & string)[] = readonly [],
>(
  src: S,
  decl: {
    id: string;
    label: string;
    description?: string;
    unit: Unit;
    polarity: Polarity;
    measure: Measure;
    splits?: readonly SplitDecl[];
    params?: Pk;
    drill?: { label: string };
  },
): MetricDecl<S, Pk> {
  assertLocalId("metric", decl.id);
  const id = `${src.id}.${decl.id}`;
  const params = decl.params ?? ([] as unknown as Pk);
  assertParamsOfSource(`metric "${id}"`, src, params);
  const splits = decl.splits ?? [];
  if (new Set(splits.map((s) => s.id)).size !== splits.length) {
    throw new Error(`metric "${id}": a split id is declared twice`);
  }
  return Object.freeze({
    kind: "metric",
    id,
    source: src.id,
    label: decl.label,
    ...(decl.description !== undefined && { description: decl.description }),
    unit: decl.unit,
    polarity: decl.polarity,
    measure: decl.measure,
    splits: Object.freeze(splits.map((s) => Object.freeze({ ...s }))),
    params: Object.freeze([...params]) as unknown as Pk,
    ...(decl.drill !== undefined && {
      drill: Object.freeze({ ...decl.drill }),
    }),
  });
}

export function defineBreakdown<
  S extends MetricSourceDecl,
  const Pk extends readonly (keyof S["params"] & string)[] = readonly [],
>(
  src: S,
  decl: {
    id: string;
    label: string;
    unit: Unit;
    order: BreakdownOrder;
    params?: Pk;
  },
): BreakdownDecl<S, Pk> {
  assertLocalId("breakdown", decl.id);
  const id = `${src.id}.${decl.id}`;
  const params = decl.params ?? ([] as unknown as Pk);
  assertParamsOfSource(`breakdown "${id}"`, src, params);
  return Object.freeze({
    kind: "breakdown",
    id,
    source: src.id,
    label: decl.label,
    unit: decl.unit,
    order: decl.order,
    params: Object.freeze([...params]) as unknown as Pk,
  });
}
