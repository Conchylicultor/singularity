import noAdhocPaneTitle from "./no-adhoc-pane-title";
import noHintFabrication from "./no-hint-fabrication";
import noRawLocationPath from "./no-raw-location-path";

/**
 * Lint barrel for the pane rules. The root `eslint.config.ts` auto-discovers this
 * default export and registers each rule repo-wide as `error`.
 *
 * Both `ignores` allowlists are intentionally EMPTY (no central allowlist —
 * mirrors `icon-auto/no-adhoc-slot-icon-size` and `control-size/no-adhoc-control`):
 *
 * - `no-adhoc-pane-title` is precise — it fires only on an inline `<Text variant>`
 *   inside a `PaneChrome` `title=` node. A deliberate per-site override escapes via
 *   `// eslint-disable-next-line pane/no-adhoc-pane-title -- reason`.
 * - `no-hint-fabrication` is precise — it fires only on a `Hint` receiver's
 *   `pick()` (a `useHint()`-sourced or `Hint<…>`-typed binding). A deliberate
 *   override escapes per-site via
 *   `// eslint-disable-next-line pane/no-hint-fabrication -- reason`.
 *
 * `no-raw-location-path` carries the only non-empty list: the two files that
 * legitimately simulate or predate the browser reader.
 */
export default {
  name: "pane",
  rules: {
    "no-adhoc-pane-title": noAdhocPaneTitle,
    "no-hint-fabrication": noHintFabrication,
    "no-raw-location-path": noRawLocationPath,
  },
  ignores: {
    "no-adhoc-pane-title": [],
    "no-hint-fabrication": [],
    "no-raw-location-path": [
      // PERMANENT — jsdom suites POINT `window.location` at a fixture URL and
      // assert on it. They are simulating the browser environment itself, not
      // reading the app's route, so the canonical reader is precisely what they
      // must not go through.
      "**/__tests__/**",
      // PERMANENT — e2e scripts read `location.pathname` inside
      // `page.evaluate()`, i.e. in the DEPLOYED page's own browser context,
      // where the harness's module graph (and so `currentRoutePath`) does not
      // exist. The two sanctioned readers stay per-site `eslint-disable-next-line`
      // (pane/web/pane.ts, web-core/web/App.tsx) rather than file ignores.
      "**/e2e/**",
    ],
  },
};
