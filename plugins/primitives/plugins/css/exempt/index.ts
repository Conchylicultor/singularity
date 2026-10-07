import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "layout/no-adhoc-layout",
    paths: ["plugins"],
    kind: "sanctioned",
    reason:
      "The layout primitives themselves (the css child plugins) open-code the layout classes the rule points everyone else away from.",
  },
] satisfies Exemptions;
