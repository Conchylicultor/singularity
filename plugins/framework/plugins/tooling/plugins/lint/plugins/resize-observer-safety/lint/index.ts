import noRawResizeObserver from "./no-raw-resize-observer";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "resize-observer-safety",
  rules: {
    "no-raw-resize-observer": noRawResizeObserver,
  },
} satisfies LintContribution;
