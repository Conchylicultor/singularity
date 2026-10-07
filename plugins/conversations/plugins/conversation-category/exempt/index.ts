import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "endpoints:no-raw-json-handlers",
    paths: ["server/internal/routes.ts"],
    kind: "sanctioned",
    reason:
      "handleClassify returns 202 Accepted; implement() emits only 200/204.",
  },
] satisfies Exemptions;
