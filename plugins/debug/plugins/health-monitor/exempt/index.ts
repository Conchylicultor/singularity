import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "timer/no-unlisted-timer",
    paths: [
      "server/internal/process-sampler.ts",
      "server/internal/host-sampler.ts",
    ],
    kind: "sanctioned",
    reason:
      "Samplers of this process / the host every 10 s: the instrument for a wedged backend, below cron's 1-minute floor.",
  },
  {
    rule: "live/no-endpoint-read",
    paths: ["web/components/health-monitor-panel.tsx"],
    kind: "debt",
    task: "task-1791560308-woqgfi",
    reason:
      "A request/response server read (useEndpoint / useEndpointResource / TanStack useQuery family / fetchEndpoint in a queryFn) not yet moved onto a liveValue or liveCollection read with useLive.",
  },
] satisfies Exemptions;
