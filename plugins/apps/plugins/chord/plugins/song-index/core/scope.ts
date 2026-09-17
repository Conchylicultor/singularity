import { z } from "zod";
import { SAMPLE_PINNED_SECTIONS, isInSample } from "./sample";

// ── Which sections an instance loads ─────────────────────────────────────────

/**
 * The `scope` setting. `auto` resolves where the load runs: the whole index on
 * the host singleton (main, or a release's single backend), the worktree
 * sample everywhere else. Never `isMain()`: a release is not main.
 */
export const INDEX_SCOPE_SETTINGS = ["auto", "full", "sample"] as const;
export type IndexScopeSetting = (typeof INDEX_SCOPE_SETTINGS)[number];

/** What a load actually keeps, once `auto` is resolved. */
export const LoadScopeSchema = z.enum(["full", "sample"]);
export type LoadScope = z.infer<typeof LoadScopeSchema>;

export function resolveLoadScope(
  setting: IndexScopeSetting,
  isHostSingleton: boolean,
): LoadScope {
  if (setting !== "auto") return setting;
  return isHostSingleton ? "full" : "sample";
}

/**
 * Whether a snapshot entry belongs to a load of `scope`. An entry whose song is
 * unknown (a skip with no processed section) is placed only by a pinned id, so
 * a sample never counts a skip it cannot attribute.
 */
export function isInLoadScope(
  scope: LoadScope,
  entry: { id: string; artistSlug: string | null; songSlug: string | null },
): boolean {
  if (scope === "full") return true;
  const { id, artistSlug, songSlug } = entry;
  if (artistSlug === null || songSlug === null) {
    return Object.hasOwn(SAMPLE_PINNED_SECTIONS, id);
  }
  return isInSample({ id, artistSlug, songSlug });
}
