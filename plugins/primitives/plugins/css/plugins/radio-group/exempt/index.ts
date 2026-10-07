import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "radio/no-adhoc-radio",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The radio-group primitive itself: it owns the native input and the minted `name`.",
  },
] satisfies Exemptions;
