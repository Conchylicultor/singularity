import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "sortable-list/no-raw-dnd-kit",
    paths: ["web"],
    kind: "sanctioned",
    reason: "This primitive is the sanctioned wrapper.",
  },
] satisfies Exemptions;
