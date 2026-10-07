import noAdhocGitGrep from "./no-adhoc-git-grep";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "git-grep-safety",
  rules: {
    "no-adhoc-git-grep": noAdhocGitGrep,
  },
} satisfies LintContribution;
