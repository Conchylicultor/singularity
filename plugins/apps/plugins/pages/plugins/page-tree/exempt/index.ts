import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "endpoints/no-void-fetch-endpoint",
    paths: ["web/components/pages-sidebar.tsx"],
    kind: "sanctioned",
    reason:
      "Page-tree expand toggle + DnD reorder; the page_blocks push refreshes.",
  },
  {
    rule: "live/no-endpoint-read",
    paths: ["web/internal/block-target.ts"],
    kind: "debt",
    task: "task-1791560308-woqgfi",
    reason:
      "A request/response server read (useEndpoint / useEndpointResource / TanStack useQuery family / fetchEndpoint in a queryFn) not yet moved onto a liveValue or liveCollection read with useLive.",
  },
] satisfies Exemptions;
