import type { BackgroundEntry, BackgroundEntryDraft } from "../core";

/** One provider's answer, as the merge sees it. */
export interface ProviderListing {
  kind: string;
  entries: readonly BackgroundEntryDraft[];
}

/**
 * Merge every provider's entries into the catalog: stamp each with its
 * provider's `kind` (a provider cannot claim another's), refuse a name listed
 * twice within one kind (two entries would share one identity, and Run now
 * would start whichever came first), and order the result so it reads the same
 * on every load — groups in the order they first appear (providers in
 * registration order, each listing its own groups in its reading order), then
 * by description within a group.
 */
export function mergeCatalog(
  listings: readonly ProviderListing[],
): BackgroundEntry[] {
  const out: BackgroundEntry[] = [];
  const groupRank = new Map<string, number>();
  for (const { kind, entries } of listings) {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.name)) {
        throw new Error(
          `[background] provider "${kind}" listed "${entry.name}" twice — names must be unique within a kind`,
        );
      }
      seen.add(entry.name);
      if (!groupRank.has(entry.group))
        groupRank.set(entry.group, groupRank.size);
      out.push({ ...entry, kind });
    }
  }
  return out.sort(
    (a, b) =>
      groupRank.get(a.group)! - groupRank.get(b.group)! ||
      a.description.localeCompare(b.description) ||
      a.name.localeCompare(b.name),
  );
}
