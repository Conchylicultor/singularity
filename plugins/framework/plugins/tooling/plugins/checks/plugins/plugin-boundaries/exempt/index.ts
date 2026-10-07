import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "marker-scan-safety/no-adhoc-marker-scan",
    paths: ["check/parse.ts"],
    kind: "sanctioned",
    reason:
      "Dual-mask: statement structure (brace/semicolon depth) is detected on a FULL mask; only the final statement text is sliced from the strings-kept copy at identical offsets so downstream sees real module specifiers.",
  },
] satisfies Exemptions;
