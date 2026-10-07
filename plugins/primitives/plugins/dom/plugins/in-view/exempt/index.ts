import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "intersection-observer-safety/no-raw-intersection-observer",
    paths: ["web/internal/in-view.ts"],
    kind: "sanctioned",
    reason: "The in-view primitive is the one sanctioned home for the idiom.",
  },
] satisfies Exemptions;
