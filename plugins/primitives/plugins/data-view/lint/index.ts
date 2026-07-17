import noAdhocRowList from "./no-adhoc-row-list";

/**
 * Lint barrel for the `no-adhoc-row-list` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `data-view/no-adhoc-row-list`
 * repo-wide as `error`.
 *
 * `ignores` carries the PERMANENT sanctioned homes — the primitives that ARE the
 * row-rendering machinery, so a `.map` → `<Row>` inside them is the
 * implementation, not a hand-rolled data list. This is not a grandfather list:
 * genuine transient-chrome uses everywhere else escape per-site via
 * `// eslint-disable-next-line data-view/no-adhoc-row-list -- <reason>`, a marker
 * that travels WITH the code.
 */
export default {
  name: "data-view",
  rules: {
    "no-adhoc-row-list": noAdhocRowList,
  },
  ignores: {
    "no-adhoc-row-list": [
      // Permanent sanctioned homes — these primitives ARE the row-rendering
      // machinery (DataView's own list/table/tree views, the tree primitive, and
      // the reorder editor), so mapping into <Row> is their implementation.
      "plugins/primitives/plugins/data-view/**",
      "plugins/primitives/plugins/tree/**",
      "plugins/reorder/plugins/editor/**",
    ],
  },
};
