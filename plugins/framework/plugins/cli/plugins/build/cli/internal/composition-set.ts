/**
 * Which compositions one build regenerates filtered registries for.
 *
 * The naive answer — "the ones the caller named" — is what let a release of
 * `website` fail on `sonata`'s registry. A `<dir>.composition.<id>.generated.ts`
 * is gitignored, but it is not a build output that may be left behind at an
 * older commit: it is LIVE INPUT to two readers that both track the checkout's
 * CURRENT tree.
 *
 *   • The served backend imports it at spawn (`server-core/bin/plugins-active`)
 *     out of this checkout's source. A registry frozen at an older commit names
 *     plugin paths that have since moved, so the namespace's next spawn throws.
 *   • `tsc`'s program is a directory glob over `core/`. That same frozen
 *     registry therefore fails the type check of every UNRELATED build in this
 *     checkout — one stale composition takes down a release of a different one.
 *
 * So the set is: what this build NAMED, plus everything already RESIDENT. A
 * registry on disk is this tree's registry, always, and "stale" stops existing
 * as a state rather than being something a later sweep has to notice.
 */
export interface CompositionBuildSet {
  /** Compositions to regenerate, requested first, each appearing once. */
  build: string[];
  /**
   * Resident compositions this build cannot re-derive, because its manifest
   * does not contain them. Reported, never acted on — see {@link planCompositionSet}.
   */
  unverifiable: string[];
}

/**
 * @param requested composition ids this build was asked for, main already dropped
 * @param resident composition ids with a registry on disk in this checkout
 * @param known does this build's manifest contain this id?
 *
 * A resident id absent from the manifest is neither built nor deleted. The
 * hermetic posture reads the CODE SEED, so a Studio-created composition is
 * legitimately missing from it: refusing would fail every release the moment
 * such a namespace exists, and deleting would break a namespace this build was
 * never asked about. It is left as found and named in `unverifiable`, since it
 * is the one registry the build cannot vouch for.
 */
export function planCompositionSet(
  requested: readonly string[],
  resident: readonly string[],
  known: (id: string) => boolean,
): CompositionBuildSet {
  const build: string[] = [];
  const unverifiable: string[] = [];
  for (const id of [...requested, ...resident]) {
    if (build.includes(id) || unverifiable.includes(id)) continue;
    (known(id) ? build : unverifiable).push(id);
  }
  return { build, unverifiable };
}
