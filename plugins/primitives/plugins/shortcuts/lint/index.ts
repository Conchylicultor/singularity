import noWindowKeyListener from "./no-window-key-listener";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "shortcuts",
  rules: {
    "no-window-key-listener": noWindowKeyListener,
  },
} satisfies LintContribution;
