import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "sink-safety/no-adhoc-profiler-seam",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The trace gates event class reads the gate gauges at the trip instant.",
  },
] satisfies Exemptions;
