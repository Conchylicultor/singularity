import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "repo-walk-safety/no-adhoc-repo-walk",
    paths: ["core/scripts/fix-shared-to-relative.ts"],
    kind: "sanctioned",
    reason:
      "A one-off migration script that already ran. It walks the way every check did before they moved to `listRepoFiles`; nothing runs it, so its file set decides no verdict.",
  },
] satisfies Exemptions;
