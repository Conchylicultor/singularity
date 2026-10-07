import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";
import noPathAllowlist from "./no-path-allowlist";

export default {
  name: "exempt",
  rules: {
    "no-path-allowlist": noPathAllowlist,
  },
} satisfies LintContribution;
