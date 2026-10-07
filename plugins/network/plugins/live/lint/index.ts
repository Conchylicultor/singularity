import noLegacyResourceSpelling from "./no-legacy-resource-spelling";
import noSentinelParam from "./no-sentinel-param";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "live",
  rules: {
    "no-legacy-resource-spelling": noLegacyResourceSpelling,
    "no-sentinel-param": noSentinelParam,
  },
} satisfies LintContribution;
