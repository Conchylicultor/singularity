import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "live/no-endpoint-read",
    paths: ["web"],
    kind: "sanctioned",
    reason:
      "The substrate: useCursorPagination wraps TanStack useInfiniteQuery for a cursor-paged list; its callers own their reads. Kept until the paged-value follow-up decides whether it folds into liveValue paged.",
  },
] satisfies Exemptions;
