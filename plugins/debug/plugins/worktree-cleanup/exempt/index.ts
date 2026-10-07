import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "endpoints:no-raw-json-handlers",
    paths: ["server/internal/handle-delete.ts"],
    kind: "sanctioned",
    reason: "400/404 guards emitted before an NDJSON stream response.",
  },
] satisfies Exemptions;
