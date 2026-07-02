import { existsSync, readFileSync, writeFileSync } from "fs";
import {
  dataViewsManifestPath,
  renderDataViewsManifest,
} from "./data-views-gen";
import {
  reorderableSlotsManifestPath,
  renderReorderableSlotsManifest,
} from "./reorderable-slots-gen";
import {
  customUtilitiesManifestPath,
  renderCustomUtilities,
} from "./custom-utilities-gen";
import {
  fieldsEagerManifestPath,
  renderFieldsEagerManifest,
} from "./fields-eager-gen";
import {
  eagerTierManifestPath,
  renderEagerTierManifest,
} from "./eager-tier-gen";

/**
 * The single source of truth for the PRE-BARREL manifest set.
 *
 * A pre-barrel manifest is a `*.generated.ts` that a plugin barrel imports at
 * module-load (directly or transitively) to register config_v2 descriptors or
 * other load-time state. Bun's ESM cache freezes a module on the first
 * `import()` and a later disk write cannot invalidate it — so EVERY such
 * manifest MUST be regenerated (via a barrel-FREE tree walk) BEFORE the first
 * barrel import in a build run. Otherwise `generateConfigOrigins` re-imports
 * stale barrels, misses the new descriptor, and `pruneOrphanedConfigFiles`
 * deletes the freshly-authored override.
 *
 * Listing the set here (rather than hand-wiring each generator into the
 * pipeline) makes the invariant enforceable: the runtime guard
 * (`assertPreBarrelManifestsFresh`) and the static check
 * (`pre-barrel-manifests-complete`) both read THIS list, so adding a manifest
 * here is the one and only registration point.
 *
 * Membership rule: a manifest belongs here iff a barrel reaches it at
 * module-load AND its renderer is barrel-free (so regenerating it before the
 * first barrel import is sound). All three current entries satisfy this:
 *   - dataViews / reorderableSlots: barrel-free static scans (`skipBarrelImport`).
 *   - customUtilities: reads `app.css` by path only (no plugin tree); reachable
 *     at module-load via the ui-kit web barrel (`cn` → `lib/utils.ts` iterates
 *     `CUSTOM_UTILITY_REGISTRY` at top level).
 */
export interface PreBarrelManifest {
  id: string;
  path: (root: string) => string;
  render: (root: string) => string | Promise<string>;
}

export const preBarrelManifests: readonly PreBarrelManifest[] = [
  {
    id: "dataViews",
    path: dataViewsManifestPath,
    render: renderDataViewsManifest,
  },
  {
    id: "reorderableSlots",
    path: reorderableSlotsManifestPath,
    render: renderReorderableSlotsManifest,
  },
  {
    id: "customUtilities",
    path: customUtilitiesManifestPath,
    render: renderCustomUtilities,
  },
  {
    // Side-effect imports of the fields storage/filter-sql server barrels. The
    // fields/server-capabilities-loader barrel imports it at module-load; its
    // renderer is a barrel-free `skipBarrelImport` tree scan, so regenerating it
    // pre-barrel is sound.
    id: "fieldsEager",
    path: fieldsEagerManifestPath,
    render: renderFieldsEagerManifest,
  },
  {
    // The deferred web plugin tier. The web-sdk core barrel reaches it at
    // module-load (`load-tiers.ts` imports `web-tiers.generated.ts`); its
    // renderer is a barrel-free `skipBarrelImport` tree scan, so regenerating
    // it pre-barrel is sound. Also generated earlier in
    // `regenerateRegistryCodegen` (sharing the registry context — one tree
    // walk, early reachability failure); this entry makes the pre-barrel
    // freshness guard + completeness check cover it, and the phase-2 write is
    // a no-op when phase 1 already ran.
    id: "eagerTier",
    path: eagerTierManifestPath,
    render: renderEagerTierManifest,
  },
];

/**
 * Regenerate one pre-barrel manifest if it drifted: render in-memory, compare
 * to the on-disk copy, write only on difference. Mirrors the write-on-diff body
 * each `generateX` helper uses, so routing through this is byte-identical.
 */
export async function writePreBarrelManifest(
  m: PreBarrelManifest,
  root: string,
): Promise<void> {
  const next = await m.render(root);
  const file = m.path(root);
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (next !== existing) writeFileSync(file, next);
}
