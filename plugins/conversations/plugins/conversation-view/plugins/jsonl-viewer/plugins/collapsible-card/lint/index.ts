import noAdhocCardTitleFont from "./no-adhoc-card-title-font";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

/**
 * Lint barrel for the `no-adhoc-card-title-font` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * The rule is `closed` (no central allowlist — mirrors
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
  closed: ["no-adhoc-card-title-font"],
} satisfies LintContribution;
