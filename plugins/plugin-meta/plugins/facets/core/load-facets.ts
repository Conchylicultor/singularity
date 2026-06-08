import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import type { Facet } from "./facets";

function isFacet(value: unknown): value is Facet {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Facet).def === "object" &&
    typeof (value as Facet).extract === "function" &&
    typeof (value as Facet).renderDoc === "function"
  );
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
  // Facets are topo-sorted by `dependsOn` so a facet that relates against another
  // (e.g. contributions → slots) loads after its dependency.
  return loadCollectedDir<Facet>(facetEntries, { isItem: isFacet, ordered: true, label: "facet" });
}
