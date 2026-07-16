// Import-map assembly (pure). The map is the composition step's contract with
// the browser: every external specifier an artifact emits MUST resolve here.

import { isBrowserUnreachableDynamic } from "./constants";

export interface ImportMapEntry {
  /** The bare specifier as emitted in artifact code (e.g. `@plugins/tasks/web`, `react`). */
  specifier: string;
  /** Site-absolute URL of the module file (e.g. `/artifacts/tasks.web.abc123/index.js`). */
  url: string;
}

/**
 * Build the inline `<script type="importmap">` payload. Entries are sorted for
 * deterministic output. Duplicate specifiers are a composition bug — two
 * artifacts claiming one name would silently shadow each other — so they throw.
 */
export function buildImportMap(entries: ImportMapEntry[]): { imports: Record<string, string> } {
  const imports: Record<string, string> = {};
  const sorted = [...entries].sort((a, b) =>
    a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0,
  );
  for (const e of sorted) {
    const existing = imports[e.specifier];
    if (existing !== undefined && existing !== e.url) {
      throw new Error(
        `import map: duplicate specifier "${e.specifier}" (${existing} vs ${e.url})`,
      );
    }
    imports[e.specifier] = e.url;
  }
  return { imports };
}

export interface ImportMapDiff {
  /** Specifiers the expected map has but the deployed one lacks. */
  missing: string[];
  /** Specifiers the deployed map has but the expected one lacks. */
  extra: string[];
  /** Specifiers present in both but pointing at different URLs. */
  changed: Array<{ specifier: string; deployed: string; expected: string }>;
}

/** Structural diff of a deployed import map against the expected one (pure). */
export function diffImportMaps(
  deployed: Record<string, string>,
  expected: Record<string, string>,
): ImportMapDiff {
  const missing: string[] = [];
  const extra: string[] = [];
  const changed: ImportMapDiff["changed"] = [];
  for (const spec of Object.keys(expected).sort()) {
    const dep = deployed[spec];
    if (dep === undefined) missing.push(spec);
    else if (dep !== expected[spec]) {
      changed.push({ specifier: spec, deployed: dep, expected: expected[spec]! });
    }
  }
  for (const spec of Object.keys(deployed).sort()) {
    if (!(spec in expected)) extra.push(spec);
  }
  return { missing, extra, changed };
}

/**
 * Verify that every emitted external specifier resolves in the map. Returns the
 * sorted list of missing specifiers (each annotated with one importer for the
 * error message); the caller hard-fails on a non-empty result — a missing entry
 * would otherwise surface at runtime as the SPA fallback serving index.html for
 * a module URL (a cryptic parse error).
 */
export function findUnmappedSpecifiers(
  emitted: Array<{ importer: string; specifiers: string[] }>,
  map: { imports: Record<string, string> },
): Array<{ specifier: string; importer: string }> {
  const missing = new Map<string, string>();
  for (const e of emitted) {
    for (const s of e.specifiers) {
      if (s.startsWith("./") || s.startsWith("../")) continue; // relative: resolved against the artifact URL
      if (!(s in map.imports) && !missing.has(s)) missing.set(s, e.importer);
    }
  }
  return [...missing.entries()]
    .map(([specifier, importer]) => ({ specifier, importer }))
    .sort((a, b) => (a.specifier < b.specifier ? -1 : 1));
}

/**
 * The unmapped DYNAMIC imports that must WARN at compose. Kinds declared
 * browser-unreachable (`BROWSER_UNREACHABLE_DYNAMIC_KINDS`) are silent by
 * declaration — they are deliberately left out of the barrel closure. Anything
 * else unmapped is a composition bug the closure should have caught, so it
 * stays loud.
 */
export function findUnmappedDynamicWarnings(
  emitted: Array<{ importer: string; specifiers: string[] }>,
  map: { imports: Record<string, string> },
): Array<{ specifier: string; importer: string }> {
  return findUnmappedSpecifiers(emitted, map).filter(
    (u) => !isBrowserUnreachableDynamic(u.specifier),
  );
}
