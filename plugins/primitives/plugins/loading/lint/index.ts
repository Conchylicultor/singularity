import noAdhocLoadingText from "./no-adhoc-loading-text";
import noShadcnSkeleton from "./no-shadcn-skeleton";

export default {
  name: "loading",
  rules: {
    "no-adhoc-loading-text": noAdhocLoadingText,
    "no-shadcn-skeleton": noShadcnSkeleton,
  },
  ignores: {
    // BURNDOWN COMPLETE — every grandfathered hand-rolled loading text was
    // migrated to <Loading> (2026-06-11). An empty array is the sanctioned
    // "no exemptions" state (see build-lint-config.ts). Keep it empty: do NOT
    // add new entries — route loading states through <Loading> instead.
    "no-adhoc-loading-text": [],
  },
};
