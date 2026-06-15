import noAdhocBar from "./no-adhoc-bar";

/**
 * Lint barrel for the `no-adhoc-bar` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * `ignores` exempts the sanctioned `Bar` primitive itself — the one legitimate
 * home for the chrome-strip signature. (Bar keeps its tier classes behind a const
 * map rather than literal class-name tokens, so it does not actually trip the
 * fingerprint; the path entry documents intent and is defensive against a future
 * refactor that inlines the tokens.)
 *
 * A genuinely-irreducible one-off escapes per-site, travelling with the code:
 *   // eslint-disable-next-line bar/no-adhoc-bar -- <reason>
 */
export default {
  name: "bar",
  rules: {
    "no-adhoc-bar": noAdhocBar,
  },
  ignores: {
    "no-adhoc-bar": ["plugins/primitives/plugins/bar/web/internal/bar.tsx"],
  },
};
