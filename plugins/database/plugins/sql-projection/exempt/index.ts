import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "sql-projection/no-asserted-sql-type",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The plugin that owns the sanctioned decoders: its docs and tests have to be able to write the banned form in order to name it.",
  },
] satisfies Exemptions;
