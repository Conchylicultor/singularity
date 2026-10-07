import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "sortable-list/no-raw-dnd-kit",
    paths: ["core/internal/auto-stubs.generated.ts"],
    kind: "sanctioned",
    reason: "Stub table naming every package the barrel importer fakes.",
  },
] satisfies Exemptions;
