import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "paths:data-root-not-joined",
    paths: ["cli/run.ts"],
    kind: "sanctioned",
    reason:
      "The serve-app presence guard asserts the root was EXPLICITLY set, which dataRoot() cannot say (unset, it answers with the dev data root). The env is the thing being checked; the command's actual path use goes through dataRoot().",
  },
] satisfies Exemptions;
