import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "paths:no-hardcoded-paths",
    paths: ["server/index.ts"],
    kind: "sanctioned",
    reason:
      "Display-only string: the `~/\u2026` spelling inside the plugin's own description metadata \u2014 prose a person reads, never a path anything resolves.",
  },
] satisfies Exemptions;
