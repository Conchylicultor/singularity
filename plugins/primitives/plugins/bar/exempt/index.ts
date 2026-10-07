import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "pane/no-adhoc-pane-toolbar",
    paths: ["web/internal/bar.tsx"],
    kind: "sanctioned",
    reason:
      "The chrome-strip primitive IS the sanctioned home of the `border-b` + `pr-floating-bar` signature. Every toolbar host (this plugin's own header `Bar`, `AppShellLayout`) composes it rather than re-wearing the classes, so this is the one file carrying them.",
  },
] satisfies Exemptions;
