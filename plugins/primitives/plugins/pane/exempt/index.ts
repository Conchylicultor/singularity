import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "pane/no-core-define-route-in-web",
    paths: ["."],
    kind: "sanctioned",
    reason:
      "The plugin does not address itself through the cross-plugin specifier: its web/ files reach ../core relatively, and its jsdom suites drive the core barrel directly on purpose.",
  },
] satisfies Exemptions;
