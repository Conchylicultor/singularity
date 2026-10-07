import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "endpoints/no-raw-web-fetch",
    paths: ["web"],
    kind: "sanctioned",
    reason:
      "Sanctioned NDJSON streaming-reader primitive (readNdjson) — streaming can't go through fetchEndpoint's single-JSON-response model.",
  },
] satisfies Exemptions;
