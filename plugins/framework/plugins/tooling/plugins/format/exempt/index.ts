import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "format-safety/no-adhoc-prettier",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The single sanctioned chokepoint for prettier: tooling/format IS the memoized dynamic import and the hardcoded options object.",
  },
] satisfies Exemptions;
