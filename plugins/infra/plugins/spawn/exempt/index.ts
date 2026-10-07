import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "spawn-safety/no-raw-bun-spawn",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The single sanctioned chokepoint for async child processes: infra/spawn IS the implementation of wedge-proof (fd-redirected) spawning, its daemon child (long-lived supervised children) included.",
  },
] satisfies Exemptions;
