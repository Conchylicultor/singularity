import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "sink-safety/no-adhoc-profiler-seam",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "Reads the flight window at the same trip instant to test span coverage of a freeze: evidence-at-trip, the same category as trace/spans, not a background sink.",
  },
] satisfies Exemptions;
