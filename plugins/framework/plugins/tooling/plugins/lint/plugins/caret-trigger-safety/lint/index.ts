import noAdhocCaretTrigger from "./no-adhoc-caret-trigger";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "caret-trigger-safety",
  rules: {
    "no-adhoc-caret-trigger": noAdhocCaretTrigger,
  },
} satisfies LintContribution;
