import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "imperative-create-table-allowlisted",
    paths: ["check/imperative-create-table-allowlisted.ts"],
    kind: "sanctioned",
    reason:
      "The check's own source: its description, message and hint strings spell out the token it greps for.",
  },
] satisfies Exemptions;
