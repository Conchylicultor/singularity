/**
 * Prewarm contribution: the data a plugin declares so the release pipeline can
 * bake its mirror's files into the bundle for offline cold start.
 *
 * A plugin drops a `prewarm/index.ts` default-exporting
 * `defineAssetMirrorPrewarm({...})`. Codegen discovers it (via the
 * `defineCollectedDir("prewarm")` marker in this plugin's core) into
 * `./prewarm.generated.ts`; a composition build emits the closure-filtered
 * `./prewarm.composition.generated.ts` the release runner reads.
 *
 * The descriptor is deliberately self-contained data (no live mirror registry)
 * so the release runner reads it generically without booting the server.
 */
export interface AssetMirrorPrewarm {
  /** Matches the mirror's `defineAssetMirror` id (the `/api/asset-mirror/<id>`
   *  URL segment). The seeded files land under `<destRoot>/<id>/`. */
  id: string;
  /** Matches the mirror's `remoteBaseUrl` (import the same shared constant).
   *  Files are fetched as `<remoteBaseUrl>/<file>` at release time. */
  remoteBaseUrl: string;
  /** Flat file names to pre-download, e.g. `"PP C#1.ogg"`. */
  files: string[];
}

/** Declare a set of mirror files to pre-warm into release bundles. Default-export
 *  the returned descriptor from a plugin's `prewarm/index.ts`. */
export function defineAssetMirrorPrewarm(
  spec: AssetMirrorPrewarm,
): AssetMirrorPrewarm {
  return spec;
}
