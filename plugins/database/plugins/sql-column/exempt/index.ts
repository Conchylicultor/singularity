import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "sql-column/no-asserted-column-type",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The plugin that owns the sanctioned decoder: its docs and tests have to be able to write the banned form in order to name it.",
  },
] satisfies Exemptions;
