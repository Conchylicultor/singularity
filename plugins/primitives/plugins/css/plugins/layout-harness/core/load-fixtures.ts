import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import { fixturesEntries } from "./fixtures.generated";
import { isLayoutFixture, type LayoutFixture } from "./types";

/**
 * Load every contributed `LayoutFixture` from the generated registry.
 *
 * Unlike `loadFacets()` (build-only, which holds the specifier in a variable so
 * the web bundler can't follow it into fs/path), the fixture modules are pure
 * web JSX — uninvoked `jsx(...)` calls importing real components, safe in BOTH
 * Bun (the geometry suite enumerates metadata in-process) AND the browser (the
 * Layout Lab gallery renders them). So we import the generated registry with a
 * literal specifier and let the web bundler statically follow it.
 *
 * De-dupes by fixture `id`, keeping the first occurrence (mirrors how
 * `loadAllChecks` de-dupes by `check.id`).
 */
export async function loadFixtures(): Promise<LayoutFixture[]> {
  return loadCollectedDir<LayoutFixture>(fixturesEntries, {
    isItem: isLayoutFixture,
    dedupeKey: (f) => f.id,
    label: "fixture",
  });
}
