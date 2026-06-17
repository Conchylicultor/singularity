import noAdhocRow from "./no-adhoc-row";

/**
 * Lint barrel for the `no-adhoc-row` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-row` repo-wide as
 * `error`.
 *
 * `ignores` is intentionally EMPTY (no central allowlist — see the row primitive
 * + ad-hoc interactive-row guardrail plan). This rule is the exact complement of
 * `badge/no-adhoc-chip`: together they partition every rounded+padded intrinsic
 * element with zero allowlist. The few irreducible non-rows escape via per-site
 * markers that travel WITH the code:
 *   - render through a component (capitalized host tag — skipped by the rule),
 *   - use a named padding token (`p-row`/`p-control` — excluded by the rule),
 *   - or `// eslint-disable-next-line row/no-adhoc-row -- <reason>` as a last
 *     resort.
 */
export default {
  name: "row",
  rules: {
    "no-adhoc-row": noAdhocRow,
  },
  ignores: {
    "no-adhoc-row": [],
  },
};
