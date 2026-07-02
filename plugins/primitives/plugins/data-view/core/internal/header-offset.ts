/**
 * CSS custom property published by `<DataView>` on its root element, holding the
 * measured pixel height of its sticky toolbar (e.g. `"44px"`).
 *
 * Grouped view children (list, …) read it to stack their own sticky group
 * headers directly BELOW the toolbar — `top: var(--dv-header-offset, 0px)` — so
 * the two stacked sticky bands never overlap regardless of the toolbar's dynamic
 * height (compact/wide fold, control size, density). A documented cross-plugin
 * CSS-var contract, mirroring the `--chrome-mask` convention: the host publishes,
 * consumers read the same name. `0px` fallback keeps a header flush-top if the
 * var is ever absent (e.g. rendered outside a `<DataView>`).
 */
export const DATA_VIEW_HEADER_OFFSET_VAR = "--dv-header-offset";
