import noAdhocScrollIntoView from "./no-adhoc-scroll-into-view";
import noAdhocScrollWrite from "./no-adhoc-scroll-write";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "scroll-safety",
  rules: {
    "no-adhoc-scroll-into-view": noAdhocScrollIntoView,
    "no-adhoc-scroll-write": noAdhocScrollWrite,
  },
} satisfies LintContribution;
