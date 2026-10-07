import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "sql-rows/no-unparsed-sql-rows",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The single sanctioned chokepoint for parsed SQL rows: sql-rows IS the implementation of the parse, so it must reach the raw result.",
  },
] satisfies Exemptions;
