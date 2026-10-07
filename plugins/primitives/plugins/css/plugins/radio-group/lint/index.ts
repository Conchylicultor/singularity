import noAdhocRadio from "./no-adhoc-radio";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

/**
 * Lint barrel for the `no-adhoc-radio` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-radio` repo-wide
 * as `error`.
 *
 * The one `exempt/index.ts` entry is the single sanctioned tier — this primitive itself, which
 * owns the raw `<input type="radio">` the rule redirects to (mirrors how
 * `no-adhoc-surface` exempts the shadcn primitive definitions and
 * `no-adhoc-layout` the layout primitives).
 *
 * There is no legacy tier: both prior hand-rolled groups (the enum and
 * dynamic-enum config renderers) were migrated onto the primitive in the same
 * change that introduced this rule. A genuine one-off escapes per-site,
 * travelling with the code:
 *
 *   // eslint-disable-next-line radio/no-adhoc-radio -- <reason>
 */
export default {
  name: "radio",
  rules: {
    "no-adhoc-radio": noAdhocRadio,
  },
} satisfies LintContribution;
