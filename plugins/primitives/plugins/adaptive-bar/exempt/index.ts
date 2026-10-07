import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "layout/no-adhoc-layout",
    paths: ["web/internal/adaptive-bar.tsx"],
    kind: "sanctioned",
    reason:
      "A layout primitive living outside `css/`: the overflow/space-sharing recipe IS the adaptive bar.",
  },
] satisfies Exemptions;
