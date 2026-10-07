import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "layout/no-adhoc-layout",
    paths: ["web/internal/surface-overlay.tsx"],
    kind: "sanctioned",
    reason:
      "A layout primitive living outside `css/`: `absolute inset-0` IS the surface overlay.",
  },
] satisfies Exemptions;
