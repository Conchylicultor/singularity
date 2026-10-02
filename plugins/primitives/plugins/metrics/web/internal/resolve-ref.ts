import type {
  BreakdownRef,
  CardRef,
  Catalog,
  CatalogBreakdown,
  CatalogMetric,
  MetricRef,
} from "../../core";

/**
 * A board ref checked against the served catalog. A board is authored data
 * naming metrics by id; the browser never imports a provider, so an id the
 * catalog does not serve is only discoverable here — and renders as an error
 * card naming it, never as a silently missing card.
 */
export type ResolvedRef =
  | { kind: "metric"; ref: MetricRef; entry: CatalogMetric }
  | { kind: "breakdown"; ref: BreakdownRef; entry: CatalogBreakdown }
  | { kind: "unknown"; message: string };

export function resolveMetricRef(
  catalog: Catalog,
  ref: MetricRef,
): Extract<ResolvedRef, { kind: "metric" | "unknown" }> {
  const entry = catalog.metrics.find((m) => m.id === ref.metric);
  if (entry === undefined) {
    return { kind: "unknown", message: `No metric "${ref.metric}" is served` };
  }
  if (
    ref.split !== undefined &&
    !entry.splits.some((s) => s.id === ref.split)
  ) {
    return {
      kind: "unknown",
      message: `Metric "${ref.metric}" has no split "${ref.split}"`,
    };
  }
  return { kind: "metric", ref, entry };
}

export function resolveCardRef(catalog: Catalog, ref: CardRef): ResolvedRef {
  if ("metric" in ref) return resolveMetricRef(catalog, ref);
  const entry = catalog.breakdowns.find((b) => b.id === ref.breakdown);
  if (entry === undefined) {
    return {
      kind: "unknown",
      message: `No breakdown "${ref.breakdown}" is served`,
    };
  }
  return { kind: "breakdown", ref, entry };
}

/** The key a card's device-local state is stored under within its view. */
export function cardKey(sectionId: string, ref: CardRef): string {
  return "metric" in ref
    ? `${sectionId}/${ref.metric}${ref.split === undefined ? "" : `:${ref.split}`}`
    : `${sectionId}/${ref.breakdown}`;
}
