import noAdhocRepoWalk from "./no-adhoc-repo-walk";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "repo-walk-safety",
  rules: {
    "no-adhoc-repo-walk": noAdhocRepoWalk,
  },
} satisfies LintContribution;
