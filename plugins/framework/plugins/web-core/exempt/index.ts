import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "plugin-boundaries",
    paths: ["web/__tests__/plugin-render.test.tsx"],
    kind: "sanctioned",
    reason:
      "App.tsx and its test import the generated web plugin registry directly: re-exporting it from the web-sdk barrel would pollute TSC's module graph in the server/central tsconfigs via transitive import chains.",
  },
] satisfies Exemptions;
