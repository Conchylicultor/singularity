import { it, expect } from "vitest";

import { loadPlugins } from "@plugins/framework/plugins/web-sdk/core";
import { webEntries } from "@plugins/framework/plugins/web-sdk/core/web.generated";

// Load-only smoke: assert the whole web plugin graph imports and registers without
// errors, and that every contribution is structurally well-formed. We deliberately
// do NOT render contributions — a contribution expects its slot's props/context
// (content, providers, the pane layout renderer, localStorage, ...), so bare
// `<Component />` rendering is architecturally meaningless. Render correctness
// belongs to per-component tests with proper scaffolding, not a blanket loop.
it(
  "all web plugins load without errors and every contribution is well-formed",
  async () => {
    const { plugins, errors } = await loadPlugins(webEntries);
    expect(errors).toEqual([]);
    expect(plugins.length).toBeGreaterThan(0);
    for (const plugin of plugins) {
      for (const contribution of plugin.contributions ?? []) {
        // every contribution must declare the slot it targets
        expect((contribution as Record<string, unknown>)._slotId).toBeTruthy();
      }
    }
  },
  30_000,
);
