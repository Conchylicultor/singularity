import type { Contribution, ContributionsFacetData } from "./types";

// Derives a contribution's display id, mirroring compute-plugin-diff.ts's
// contributionStrings(): prefer the resolved paneId, else the quote-stripped
// `id` prop. Shared by the diff projection, the catalog table, and the detail
// section so all three surfaces agree on the same id.
export function contributionId(c: Contribution): string | undefined {
  const raw = c.paneId ?? c.props["id"]?.replace(/^["'`]|["'`]$/g, "");
  return raw || undefined;
}

export function contributionsToComparable(data: ContributionsFacetData): string[] {
  return data.static.map((c) => {
    const id = contributionId(c);
    return id ? `${c.slot} "${id}"` : c.slot;
  });
}
