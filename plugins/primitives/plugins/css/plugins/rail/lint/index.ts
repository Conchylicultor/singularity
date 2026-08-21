import noPanelBleed from "./no-panel-bleed";

/**
 * Lint barrel for the rail contract. The root `eslint.config.ts` auto-discovers
 * this default export and registers the rule repo-wide as `error`.
 *
 * `no-panel-bleed` closes the one hole the contract itself opened: removing
 * `DialogContent.padded` made `className="rail-bleed"` the attractive
 * substitute, and it half-works (see the rule). Bleeding a panel is never
 * correct — the panel IS the region — so this needs no allowlist, and should
 * never grow one. A band inside the panel bleeds; the panel does not.
 */
export default {
  name: "rail",
  rules: {},
  // Class rules are FACTORIES: they read class tokens, so they take the one
  // shared walk from `buildLintConfig` instead of hand-copying it. See
  // @plugins/framework/plugins/tooling/plugins/lint/core/class-token-walk.ts.
  classRules: {
    "no-panel-bleed": noPanelBleed,
  },
};
