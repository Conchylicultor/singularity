import noAdhocBar from "./no-adhoc-bar";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

/**
 * Lint barrel for the `no-adhoc-bar` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * The sanctioned `Bar` primitive itself is the one legitimate home for the
 * chrome-strip signature. It keeps its tier classes behind a const map rather
 * than literal class-name tokens, so it does not trip the fingerprint and needs
 * no exemption; if a refactor inlines the tokens, it declares one in its own
 * `exempt/index.ts`.
 *
 * A genuinely-irreducible one-off escapes per-site, travelling with the code:
 *   // eslint-disable-next-line bar/no-adhoc-bar -- <reason>
 */
export default {
  name: "bar",
  rules: {},
  // Class rules are FACTORIES: they read class tokens, so they take the one
  // shared walk from `buildLintConfig` instead of hand-copying it. See
  // @plugins/framework/plugins/tooling/plugins/lint/core/class-token-walk.ts.
  classRules: {
    "no-adhoc-bar": noAdhocBar,
  },
} satisfies LintContribution;
