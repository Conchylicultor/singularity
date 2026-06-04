import type { Facet } from "./facets";

interface GeneratedEntry {
  pluginPath: string;
  loader: () => Promise<{ default: unknown }>;
  dependsOn: string[];
}

function isFacet(value: unknown): value is Facet {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Facet).def === "object" &&
    typeof (value as Facet).extract === "function" &&
    typeof (value as Facet).renderDoc === "function"
  );
}

function topoSort(entries: GeneratedEntry[]): GeneratedEntry[] {
  const byPath = new Map(entries.map(e => [e.pluginPath, e]));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const result: GeneratedEntry[] = [];
  function visit(path: string) {
    if (visited.has(path)) return;
    if (stack.has(path))
      throw new Error(`Facet dependency cycle: ${[...stack, path].join(" → ")}`);
    stack.add(path);
    const entry = byPath.get(path);
    if (entry) for (const dep of entry.dependsOn) visit(dep);
    stack.delete(path);
    visited.add(path);
    if (entry) result.push(entry);
  }
  for (const e of entries) visit(e.pluginPath);
  return result;
}

export async function loadFacets(): Promise<Facet[]> {
  // loadFacets is build/server-only (it reads facet/ folders via fs). The
  // specifier is held in a variable so the frontend bundler cannot statically
  // follow it into facet.generated → every facet/index.ts → parse-utils (fs/path),
  // which would break the web build. (A `/* @vite-ignore */` comment is stripped
  // by esbuild's TS transform, so a non-literal specifier is the reliable form.)
  // This keeps facets/core safe to import transitively from browser render slices,
  // which only need the pure defineFacet/getFacet/types. Never runs in the browser.
  const generatedModule = "./facet.generated";
  const { facetEntries } = await import(generatedModule);
  const sorted = topoSort(facetEntries as GeneratedEntry[]);
  const results = await Promise.allSettled(
    sorted.map((e) => e.loader()),
  );
  const out: Facet[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === "rejected") continue;
    const exported = (r.value as { default?: unknown }).default;
    const items = Array.isArray(exported) ? exported : exported ? [exported] : [];
    for (const f of items) {
      if (isFacet(f)) out.push(f);
    }
  }
  return out;
}
