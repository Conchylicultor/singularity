import noAdhocCard from "./no-adhoc-card";

/**
 * Lint barrel for the `no-adhoc-card` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-card` repo-wide as
 * `error`.
 *
 * `ignores` is intentionally EMPTY (no central allowlist — mirrors the row
 * primitive). The irreducible non-Card cards escape via per-site markers that
 * travel WITH the code:
 *   - render through the `<Card>` component (capitalized host tag — skipped),
 *   - use the named `p-card` padding token (excluded by the rule),
 *   - or `// eslint-disable-next-line card/no-adhoc-card -- <reason>`.
 */
export default {
  name: "card",
  rules: {
    "no-adhoc-card": noAdhocCard,
  },
  ignores: {
    "no-adhoc-card": [],
  },
};
