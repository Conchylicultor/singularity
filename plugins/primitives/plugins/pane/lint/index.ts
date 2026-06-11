import noAdhocPaneTitle from "./no-adhoc-pane-title";

/**
 * Lint barrel for the `no-adhoc-pane-title` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * `ignores` is intentionally EMPTY (no central allowlist — mirrors
 * `icon-auto/no-adhoc-slot-icon-size` and `control-size/no-adhoc-control`). The
 * rule is precise: it fires only on an inline `<Text variant>` inside a
 * `PaneChrome` `title=` node. A deliberate per-site override escapes via
 * `// eslint-disable-next-line pane/no-adhoc-pane-title -- reason`.
 */
export default {
  name: "pane",
  rules: {
    "no-adhoc-pane-title": noAdhocPaneTitle,
  },
  ignores: {
    "no-adhoc-pane-title": [],
  },
};
