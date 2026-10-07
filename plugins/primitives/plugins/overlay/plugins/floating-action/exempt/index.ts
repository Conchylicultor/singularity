import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "layout/no-adhoc-layout",
    paths: ["web/internal/floating-action.tsx"],
    kind: "sanctioned",
    reason:
      "A layout primitive living outside `css/`: it owns the layout mechanics it spells.",
  },
] satisfies Exemptions;
