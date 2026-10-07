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
    rule: "sortable-list/no-raw-dnd-kit",
    paths: ["web"],
    kind: "sanctioned",
    reason:
      "The other drag primitives, which resolve drops to ranks themselves: flat rank reorder (sortable, `CSS.Translate` only) and the tree (a `DragOverlay` chip, so nothing scales).",
  },
] satisfies Exemptions;
