import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "row/no-adhoc-row",
    paths: ["web"],
    kind: "sanctioned",
    reason:
      "The definition site: fingerprint B (`p-row` + a hover tint) flags a rebuilt Row, and no class-level test can tell the original from an exact copy.",
  },
  {
    rule: "row/no-row-focus-class",
    paths: ["web"],
    kind: "sanctioned",
    reason:
      "`row/web` is where the app's canonical focus ring (`focus-ring` + `focus-ring-from`) is applied; a class-level test cannot tell that definition site from a call site copying it.",
  },
] satisfies Exemptions;
