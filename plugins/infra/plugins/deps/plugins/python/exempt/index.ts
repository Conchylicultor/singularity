import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "python/no-system-python",
    paths: ["lint/no-system-python.test.ts"],
    kind: "sanctioned",
    reason: "The rule's own tests hold its forbidden spellings as fixtures.",
  },
] satisfies Exemptions;
