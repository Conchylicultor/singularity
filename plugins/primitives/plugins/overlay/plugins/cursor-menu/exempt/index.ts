import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "layout/no-adhoc-layout",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The sanctioned home for the body-portaled `position: fixed` mechanic: a cursor-anchored menu. It owns the raw inline `position: fixed`; everyone else routes through it. (The off-screen measure strip used to sit beside it here — it is gone, along with the render-everything-twice measurement it existed to serve. See `primitives/adaptive-bar`, which measures the real nodes in place.)",
  },
] satisfies Exemptions;
