import noModuleScopeDom from "./no-module-scope-dom";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "dom-access-safety",
  rules: {
    "no-module-scope-dom": noModuleScopeDom,
  },
} satisfies LintContribution;
