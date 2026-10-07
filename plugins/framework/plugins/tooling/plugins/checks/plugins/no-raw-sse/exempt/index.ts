import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "no-raw-sse",
    paths: ["check/index.ts"],
    kind: "sanctioned",
    reason: "The check names the token it bans in its hint text.",
  },
] satisfies Exemptions;
