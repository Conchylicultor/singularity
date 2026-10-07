import noRawSelectionRange from "./no-raw-selection-range";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "dom-selection-safety",
  rules: {
    "no-raw-selection-range": noRawSelectionRange,
  },
} satisfies LintContribution;
