// Pure helpers for the web-artifacts checks: deployed-dist extraction (import
// map + entry script from index.html) and the vendored-module sourcemap scan.

/** The inline `<script type="importmap">` payload of a composed index.html. */
export function extractImportMap(html: string): Record<string, string> | null {
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!m) return null;
  const parsed = JSON.parse(m[1]!) as { imports?: Record<string, string> };
  return parsed.imports ?? null;
}

/** The entry module script src of a composed index.html. */
export function extractEntryScriptSrc(html: string): string | null {
  const m = html.match(/<script type="module" src="([^"]+)"><\/script>/);
  return m ? m[1]! : null;
}

/**
 * The npm packages whose modules a built artifact INLINED, read from its
 * sourcemap `sources`. The sourcemap is the one reliable positive inclusion
 * signal: the builder's `meta.staticImportsByFile`/`dynamicImports` record only what
 * stayed EXTERNAL (the import map's job), so an accidentally-bundled package is
 * invisible there — while every module rollup folded into the bundle appears in
 * `sources` (the builder builds every artifact with `sourcemap: true`,
 * unconditionally). A source under `node_modules/` therefore proves an npm
 * module was inlined; the package name is the path segment after the LAST
 * `node_modules/` (handles nested installs and scoped packages).
 */
export function packagesInSourcemapSources(sources: readonly string[]): string[] {
  const pkgs = new Set<string>();
  for (const source of sources) {
    const i = source.lastIndexOf("node_modules/");
    if (i === -1) continue;
    const rest = source.slice(i + "node_modules/".length);
    const parts = rest.split("/");
    const pkg = parts[0]!.startsWith("@") ? `${parts[0]}/${parts[1] ?? ""}` : parts[0]!;
    if (pkg) pkgs.add(pkg);
  }
  return [...pkgs].sort();
}

/** The subset of inlined packages NOT covered by the inline allowlist. */
export function offendingPackages(
  inlined: readonly string[],
  allowlist: ReadonlySet<string>,
): string[] {
  return inlined.filter((p) => !allowlist.has(p));
}
