import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "daemon/no-raw-worker",
    paths: ["."],
    kind: "sanctioned",
    reason: "The daemon primitive itself is where the one `new Worker` lives.",
  },
] satisfies Exemptions;
