import noRawIntersectionObserver from "./no-raw-intersection-observer";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "intersection-observer-safety",
  rules: {
    "no-raw-intersection-observer": noRawIntersectionObserver,
  },
} satisfies LintContribution;
