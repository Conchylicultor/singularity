import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "marker-scan-safety/no-adhoc-marker-scan",
    paths: ["facet/index.ts"],
    kind: "sanctioned",
    reason:
      "Token-in-string: scans caller source for an `/api/<prefix>` URL that legitimately lives inside caller string literals passed to fetch — there is no enclosing marker call, so masking fully would erase the URL.",
  },
] satisfies Exemptions;
