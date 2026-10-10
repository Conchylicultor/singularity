import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "detached-work-safety/no-raw-set-interval",
    paths: ["server/internal/emitter.ts"],
    kind: "sanctioned",
    reason:
      "A synthetic test harness started by hand from a debug pane, at a rate the person picks (up to 100/s) and stopped after at most a few minutes: not background activity, and its cadence is chosen at runtime.",
  },
  {
    rule: "live/no-endpoint-read",
    paths: ["web/components/emit-pane.tsx"],
    kind: "debt",
    task: "task-1791560308-woqgfi",
    reason:
      "A request/response server read (useEndpoint / useEndpointResource / TanStack useQuery family / fetchEndpoint in a queryFn) not yet moved onto a liveValue or liveCollection read with useLive.",
  },
] satisfies Exemptions;
