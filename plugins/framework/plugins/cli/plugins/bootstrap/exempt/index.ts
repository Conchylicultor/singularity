import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "repo-walk-safety/no-adhoc-repo-walk",
    paths: ["cli/ensure-deps.ts"],
    kind: "sanctioned",
    reason:
      "Bounded walks of a KNOWN subtree, not attempts to enumerate the repo's sources. These skip `node_modules` because walking into it would be slow and pointless, not because they are deciding what counts as a source file — so git's answer is not what they want.  `ensure-deps` walks for dependency INPUTS (package.json / lockfiles), and `node_modules` is the output it is deciding whether to rebuild.",
  },
] satisfies Exemptions;
