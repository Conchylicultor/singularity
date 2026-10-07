import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "dom-selection-safety/no-raw-selection-range",
    paths: ["web/internal/dom-selection.ts"],
    kind: "sanctioned",
    reason:
      "Exactly one entry — the primitive's own internal file. All four prior callers (caret-trigger's `caret-anchor.ts`, page-editor's `caret-geometry.ts` and `format-toolbar-plugin.tsx`, and `diff-view.tsx`) are MIGRATED rather than exempted. That includes `diff-view`, which reads the range for CONTENT rather than geometry and is otherwise a correct caller: a rule that needs an allowlist entry for a correct use is enforcing less than it looks.",
  },
] satisfies Exemptions;
