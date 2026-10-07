import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "namespace:no-hand-built-url",
    paths: ["core/namespace.ts", "check/index.ts"],
    kind: "sanctioned",
    reason:
      "The owner of the host grammar, its tests, and this check, which names the pattern it bans.",
  },
] satisfies Exemptions;
