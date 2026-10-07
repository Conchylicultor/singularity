import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "durable-signals-accounted",
    paths: ["server/internal/log.ts"],
    kind: "sanctioned",
    reason:
      "defineLogSink's own body builds its file sink with `id: spec.id`. Those ids are exactly the defineLogSink call sites, which are scanned and accounted by their literal ids.",
  },
] satisfies Exemptions;
