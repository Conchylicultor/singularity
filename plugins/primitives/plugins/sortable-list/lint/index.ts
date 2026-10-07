import noRawDndKit from "./no-raw-dnd-kit";
import noScalingTransform from "./no-scaling-transform";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "sortable-list",
  rules: {
    "no-raw-dnd-kit": noRawDndKit,
    "no-scaling-transform": noScalingTransform,
  },
} satisfies LintContribution;
