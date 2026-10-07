import noRawWorker from "./no-raw-worker";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "daemon",
  rules: {
    "no-raw-worker": noRawWorker,
  },
} satisfies LintContribution;
