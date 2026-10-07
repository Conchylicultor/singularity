import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "theme-boundary/no-adhoc-theme-scope",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The <Theme> primitive itself: it stamps the attribute and renders the provider, the whole implementation of the contract this rule points at.",
  },
] satisfies Exemptions;
