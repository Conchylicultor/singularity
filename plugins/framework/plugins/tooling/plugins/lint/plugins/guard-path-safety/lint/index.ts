import noAdhocPathResolve from "./no-adhoc-path-resolve";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "guard-path-safety",
  rules: {
    "no-adhoc-path-resolve": noAdhocPathResolve,
  },
} satisfies LintContribution;
