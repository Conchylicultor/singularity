import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "check-runner-safety/no-adhoc-check-runner",
    paths: ["cli/run.ts"],
    kind: "sanctioned",
    reason:
      "The ONE sanctioned in-process caller: the `check` command's action body, a file and not a directory so its data-only `cli/index.ts` and any future file dropped beside it stay covered by the rule. build and push spawn the pass instead.",
  },
] satisfies Exemptions;
