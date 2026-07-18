import noRawHistoryNav from "./no-raw-history-nav";

export default {
  name: "apps-core",
  rules: {
    "no-raw-history-nav": noRawHistoryNav,
  },
  ignores: {
    "no-raw-history-nav": [
      // PERMANENT — the default (standalone) history adapter: the sanctioned
      // low-level writer when no shell adapter is installed (tests, and any
      // composition without the tabs layer). The pane store emits push/replace
      // INTENTS through the adapter; this is where the default one writes them.
      "plugins/primitives/plugins/pane/web/history-sink.ts",
      // PERMANENT — the shell (app-aware) history adapter: the ONE low-level
      // writer in the tabs layer. It stamps `{ tabId, appId }` onto each entry so
      // browser back/forward restores the whole snapshot; every navigate() /
      // pane.open() funnels through the pane store → this adapter's commit().
      "plugins/apps-core/plugins/tabs/web/internal/shell-history-adapter.ts",
      // PERMANENT — pre-tab URL canonicalization (`/`→`/home`, unmatched path →
      // fallback namespace). Runs in AppsLayout BEFORE TabsProvider mounts, so
      // there is no live store / focused tab to route through yet.
      "plugins/apps-core/plugins/layout/web/components/apps-layout.tsx",
      // PERMANENT — jsdom test suites. The rule protects PRODUCTION navigation
      // from desyncing the focused tab's appId; a test seeding `history.state`
      // fixtures (including legacy pre-snapshot entry shapes no sanctioned
      // writer produces anymore) is simulating the browser environment itself,
      // not navigating the app.
      "**/__tests__/**",
    ],
  },
};
