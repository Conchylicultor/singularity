import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "type-scale:closed-role-ladder:raw-vars",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The type-scale plugin owns the ladder's variables and their declarations.",
  },
] satisfies Exemptions;
