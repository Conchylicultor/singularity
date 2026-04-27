---
name: Components in separate folder
description: Plugin React components should live in a components/ subfolder, not inline in index.ts
type: feedback
originSessionId: 995552a3-4f5a-41d1-aa0e-a8da92be4689
---
Plugin React components should be placed in a `components/` subfolder (e.g. `plugins/{name}/web/components/`), not defined inline in the plugin's `index.ts`.

**Why:** Keeps plugin entry points clean — just the plugin definition and contributions. Components are separate concerns.

**How to apply:** When creating or modifying plugins that have React components, always put them in `web/components/{component-name}.tsx` and import them from the plugin index.
