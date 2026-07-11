import noAdhocPaneTitle from "./no-adhoc-pane-title";
import noHintFabrication from "./no-hint-fabrication";

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
 */
export default {
  name: "pane",
  rules: {
    "no-adhoc-pane-title": noAdhocPaneTitle,
    "no-hint-fabrication": noHintFabrication,
  },
  ignores: {
    "no-adhoc-pane-title": [],
    "no-hint-fabrication": [],
  },
};
