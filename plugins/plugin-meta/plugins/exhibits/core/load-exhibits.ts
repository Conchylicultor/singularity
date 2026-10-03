import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import { exhibitsEntries } from "./exhibits.generated";
import { isExhibit, type Exhibit } from "./types";

/**
 * Every contributed exhibit, from the generated registry.
 *
 * Strict: a contribution that fails to load, exports nothing, or exports a
 * malformed item throws (naming every broken plugin at once) — a broken exhibit
 * must not read as one that does not exist.
 *
 * NOT de-duplicated by id: two plugins claiming one id both stay in the list,
 * so `lookupExhibit` reports `ambiguous` rather than whichever loaded first.
 *
 * Safe in Bun and the browser: the registry's loaders are dynamic imports, and
 * an `app` exhibit's component sits behind its own `load()`, so reading the
 * catalog evaluates no app-runtime code. In the browser each loader fetches the
 * contributor's `exhibits.js` — a second entry of its web artifact, never in
 * the boot preload set.
 */
export async function loadExhibits(): Promise<Exhibit[]> {
  return loadCollectedDir<Exhibit>(exhibitsEntries, {
    isItem: isExhibit,
    strict: true,
    label: "exhibit",
  });
}
