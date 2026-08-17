import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import { fixturesEntries } from "./fixtures.generated";
import { isLayoutFixture, isRegionFixture, type HarnessFixture } from "./types";

/**
 * Load every contributed fixture from the generated registry.
 *
 * The catalog is a UNION: a `LayoutFixture` authors its own children, a
 * `RegionFixture` leaves a hole the harness fills with `REGION_CHILDREN`. Both
 * kinds live in the same `fixtures/index.ts` default export, and
 * `expandRegionFixtures()` (web/) turns the regions into ordinary
 * `LayoutFixture`s — so every consumer downstream of that call still deals in
 * one fixture shape.
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
export async function loadFixtures(): Promise<HarnessFixture[]> {
  return loadCollectedDir<HarnessFixture>(fixturesEntries, {
    isItem: (v): v is HarnessFixture =>
      isLayoutFixture(v) || isRegionFixture(v),
    dedupeKey: (f) => f.id,
    label: "fixture",
  });
}
