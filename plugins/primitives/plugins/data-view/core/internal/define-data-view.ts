/**
 * `defineDataView` marker + branded `DataViewId`.
 *
 * Every `<DataView>` is config-backed (config mode is universal — there is no
 * default mode). A consumer declares its surface's stable id with
 * `defineDataView("<id>")`; build-time codegen scrapes these marker calls (the
 * `defineDataView` scanner, mirroring how reorder scrapes `defineRenderSlot`)
 * into `shared/data-views.generated.ts`, and the data-view barrels register one
 * config_v2 descriptor per id under the `primitives.data-view` plugin.
 *
 * The branded `DataViewId` is the structural guarantee: `DataViewProps.storageKey`
 * is typed `DataViewId`, so a consumer cannot pass a raw string — it must route
 * through `defineDataView`, which is what makes the id discoverable by codegen
 * (an un-scraped id would have no registered descriptor and `useConfig` would
 * throw on read).
 */
export type DataViewId = string & { readonly __dataViewId: unique symbol };

/**
 * Mark a string as a DataView surface id and brand it `DataViewId`.
 *
 * The grammar `^[a-zA-Z0-9._-]+$` bans `:` so the id is filename-safe as the
 * config descriptor name at `config/primitives/data-view/<id>.jsonc` (dots are
 * already used by existing config names; colon is the only novel char). Calls
 * must live under a plugin's `web/` (where codegen scans).
 */
export function defineDataView(id: string): DataViewId {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error(
      `defineDataView: id "${id}" must match [a-zA-Z0-9._-] (no ":" — ids are config filenames)`,
    );
  }
  return id as DataViewId;
}
