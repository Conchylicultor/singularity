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

/**
 * The CSS custom property carrying the **pane-gutter** — the one horizontal rail
 * every band a `<DataView>` owns (toolbar, view bodies, group headers) reads, so
 * they align with the pane header instead of each inventing its own inset. Same
 * host-publishes / consumers-read-the-same-name convention as
 * `DATA_VIEW_HEADER_OFFSET_VAR` (and `--chrome-mask`).
 *
 * Most code never touches this constant: **readers** use the `px-pane-gutter`
 * utility (which defaults the var to the pane header's `--chrome-pad-x`, so the
 * rail auto-aligns with nothing published), and a host that already supplies its
 * own inset zeroes the gutter with the `pane-gutter-flush` utility class. The
 * constant exists only for a **custom-value setter** — a host that needs to
 * publish a specific gutter width (none today), which sets this property directly.
 */
export const PANE_GUTTER_VAR = "--pane-gutter";
