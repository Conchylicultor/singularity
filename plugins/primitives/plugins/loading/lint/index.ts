import noAdhocLoadingText from "./no-adhoc-loading-text";
import noShadcnSkeleton from "./no-shadcn-skeleton";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

export default {
  name: "loading",
  rules: {
    "no-adhoc-loading-text": noAdhocLoadingText,
    "no-shadcn-skeleton": noShadcnSkeleton,
  },
  closed: ["no-adhoc-loading-text"],
} satisfies LintContribution;
