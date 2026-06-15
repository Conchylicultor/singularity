import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import type { CompositionManifest } from "@plugins/plugin-meta/plugins/closure/core";
import { isCompositionManifest } from "./is-composition";

/**
 * Discover and load every declared composition: each `<plugin>/composition/index.ts`
 * default-exporting one `CompositionManifest` (or an array of them). The generated
 * registry (`composition.generated.ts`) is emitted by codegen on `./singularity
 * build` and lists every such file as a `CollectedEntry`.
 *
 * The specifier is held in a variable so the frontend bundler cannot statically
 * follow it into `composition.generated → every composition/index.ts` — mirroring
 * `facets/core/load-facets.ts`, since Studio will import this loader client-side in
 * a later increment.
 *
 * NO de-dupe: duplicate `name`s must fail the `composition-closure` check loudly
 * rather than be silently dropped here. The check gates merges, so duplicates never
 * reach runtime.
 */
export async function loadCompositions(): Promise<CompositionManifest[]> {
  const generatedModule = "./composition.generated";
  const { compositionEntries } = await import(generatedModule);
  return loadCollectedDir<CompositionManifest>(compositionEntries, {
    isItem: isCompositionManifest,
    label: "composition",
  });
}
