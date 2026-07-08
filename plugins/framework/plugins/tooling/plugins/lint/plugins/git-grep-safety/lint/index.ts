import noAdhocGitGrep from "./no-adhoc-git-grep";

export default {
  name: "git-grep-safety",
  rules: {
    "no-adhoc-git-grep": noAdhocGitGrep,
  },
  ignores: {
    // `grep-code.ts` is the ONE sanctioned home for the `git grep` plumbing —
    // it owns the scan-tree-aware / `--untracked` candidate discovery every
    // other caller must route through.
    "no-adhoc-git-grep": [
      "plugins/framework/plugins/tooling/plugins/checks/core/grep-code.ts",
    ],
  },
};
