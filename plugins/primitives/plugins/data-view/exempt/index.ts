import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "data-view/no-adhoc-row-list",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "These primitives ARE the row-rendering machinery (DataView's own list/table/tree views, the tree primitive, and the reorder editor), so mapping into <Row> is their implementation.",
  },
  {
    rule: "live/visible-range-minter",
    paths: ["web/internal/pages-viewport.ts"],
    kind: "sanctioned",
    reason:
      "The one place a paged read's viewport is minted: data-view measures the rows a DataView draws, and useLivePagesPaging hands the sink that feeds it out inside the paging the DataView takes.",
  },
] satisfies Exemptions;
