import noRawHistoryNav from "./no-raw-history-nav";

export default {
  name: "apps-core",
  rules: {
    "no-raw-history-nav": noRawHistoryNav,
  },
  ignores: {
    "no-raw-history-nav": [
      // PERMANENT — the sanctioned route→URL mirror. The live PaneStore's
      // setRoute is the ONE legitimate low-level history writer; navigate() and
      // pane.open() both funnel through it.
      "plugins/primitives/plugins/pane/web/pane.ts",
      // PERMANENT — pre-tab URL canonicalization (`/`→`/home`, unmatched path →
      // fallback namespace). Runs in AppsLayout BEFORE TabsProvider mounts, so
      // there is no live store / focused tab to route through yet.
      "plugins/apps-core/web/components/apps-layout.tsx",
    ],
  },
};
