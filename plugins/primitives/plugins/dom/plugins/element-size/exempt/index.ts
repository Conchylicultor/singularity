import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "resize-observer-safety/no-raw-resize-observer",
    paths: ["web/internal/element-size.ts"],
    kind: "sanctioned",
    reason:
      "The element-size primitive is the one sanctioned home for the idiom.",
  },
] satisfies Exemptions;
