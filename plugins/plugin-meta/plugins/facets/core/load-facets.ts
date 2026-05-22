import type { Facet } from "./facets";

function isFacet(value: unknown): value is Facet {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Facet).def === "object" &&
    typeof (value as Facet).extract === "function" &&
    typeof (value as Facet).renderDoc === "function"
  );
}

export async function loadFacets(): Promise<Facet[]> {
  const { facetEntries } = await import("./facet.generated");
  const results = await Promise.allSettled(
    facetEntries.map((e: { loader: () => Promise<{ default: unknown }> }) => e.loader()),
  );
  const out: Facet[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === "rejected") continue;
    const exported = (r.value as { default?: unknown }).default;
    const items = Array.isArray(exported) ? exported : exported ? [exported] : [];
    for (const f of items) {
      if (isFacet(f)) out.push(f);
    }
  }
  return out;
}
