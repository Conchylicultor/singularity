import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "repo-walk-safety/no-adhoc-repo-walk",
    paths: ["core/internal/global-css.ts"],
    kind: "sanctioned",
    reason:
      "`global-css` collects each plugin's own stylesheet from the plugin tree.",
  },
] satisfies Exemptions;
