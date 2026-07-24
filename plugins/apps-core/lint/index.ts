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
      // writer in the tabs layer. It stamps `{ tabId, appId, appInstance }` onto
      // each entry so browser back/forward restores the whole snapshot, and a
      // cold boot can tell which app instance the entry belongs to; every
      // navigate() / pane.open() funnels through the pane store → its commit().
      "plugins/apps-core/plugins/tabs/web/internal/shell-history-adapter.ts",
      // PERMANENT — URL canonicalization (`/`→`/home`, unmatched path → fallback
      // namespace). It is legitimately URL-driven (`matchAppForPath`), correcting
      // the address bar itself rather than expressing a user navigation, so it
      // must NOT route through navigate() — that would mint a history entry for a
      // correction that should never be independently reachable.
      //
      // It does NOT run before TabsProvider mounts, despite what this comment
      // used to claim. `bootTabs` runs in TabsProvider's render-phase useState
      // initializer, and AppsLayout is TabsProvider's PARENT — React flushes
      // effects children-first, so this redirect fires AFTER the boot entry has
      // already been stamped. That is why `redirectTo` preserves `history.state`
      // instead of blanking it: on a bare-root boot it lands on a stamped entry,
      // and wiping the stamp there would strand the entry (see
      // `primitives/app-instance`, "Why two signals" — the earlier wrong premise
      // here is what made a single-signal design look safe).
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
