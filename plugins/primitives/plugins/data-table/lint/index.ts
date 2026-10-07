import noClassAsGridWidth from "./no-class-as-grid-width";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "data-table",
  rules: {
    "no-class-as-grid-width": noClassAsGridWidth,
  },
  closed: ["no-class-as-grid-width"],
} satisfies LintContribution;
