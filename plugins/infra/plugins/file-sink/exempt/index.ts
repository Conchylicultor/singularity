import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "sink-safety/no-adhoc-file-sink",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The sanctioned append chokepoint: file-sink IS the implementation of bounded, rotated, declared durable append.",
  },
] satisfies Exemptions;
