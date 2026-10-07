import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "detached-work-safety/no-raw-set-interval",
    paths: ["shared/timer.ts"],
    kind: "sanctioned",
    reason: "THE sanctioned implementation: `defineTimer` itself.",
  },
] satisfies Exemptions;
