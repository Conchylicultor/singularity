import noRawHistoryNav from "./no-raw-history-nav";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "apps-core",
  rules: {
    "no-raw-history-nav": noRawHistoryNav,
  },
} satisfies LintContribution;
