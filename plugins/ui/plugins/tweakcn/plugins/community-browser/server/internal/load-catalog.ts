import type { CatalogTheme } from "../../shared/types";

// The community catalog is ~2 MB of JSON. Importing it at module scope parses and
// holds it resident in RSS on EVERY backend boot, even though most worktrees never
// open the tweakcn community browser. Load it lazily on first request and memoize
// the promise (not just the resolved value) so concurrent first requests share one
// load instead of racing two parses. Every handler that needs the catalog goes
// through this single load path, so the blob is parsed at most once per process.
let catalogPromise: Promise<CatalogTheme[]> | undefined;

export function loadCatalog(): Promise<CatalogTheme[]> {
  if (catalogPromise === undefined) {
    catalogPromise = import("../../shared/catalog.json").then(
      (mod) => mod.default as CatalogTheme[],
    );
  }
  return catalogPromise;
}
