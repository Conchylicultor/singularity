import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

// No runtime contributions: the harness's web code is the bare measurer page
// (`internal/entry.tsx`, built by `internal/build-measurer-page.ts`) and the
// geometry suite that drives it. The in-app view of the same exhibits is the
// Debug → Exhibits gallery, owned by the catalog (`plugin-meta/exhibits`).
export default {
  description:
    "Layout-primitive geometry harness, web half: the bare measurer page and the bun:test geometry suite that measure every geometry-gated exhibit across its width sweep.",
  contributions: [],
} satisfies PluginDefinition;
