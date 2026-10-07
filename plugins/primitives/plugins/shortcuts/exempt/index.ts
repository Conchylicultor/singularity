import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "shortcuts/no-window-key-listener",
    paths: ["web/internal/shortcut-manager.tsx"],
    kind: "sanctioned",
    reason:
      "The registry's own dispatcher is the one sanctioned page-wide listener.",
  },
] satisfies Exemptions;
