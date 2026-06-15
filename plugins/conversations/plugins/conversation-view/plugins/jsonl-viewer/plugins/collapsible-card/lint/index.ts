import noAdhocCardTitleFont from "./no-adhoc-card-title-font";

/**
 * Lint barrel for the `no-adhoc-card-title-font` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * `ignores` is intentionally EMPTY (no central allowlist — mirrors
 * `pane/no-adhoc-pane-title`). The rule is precise: it fires only on a
 * font-family class inside an inline `CollapsibleCard` `label=`/`note=` node. A
 * deliberate per-site override escapes via
 * `// eslint-disable-next-line collapsible-card/no-adhoc-card-title-font -- reason`.
 */
export default {
  name: "collapsible-card",
  rules: {
    "no-adhoc-card-title-font": noAdhocCardTitleFont,
  },
  ignores: {
    "no-adhoc-card-title-font": [],
  },
};
