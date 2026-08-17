import noAdhocRow from "./no-adhoc-row";

/**
 * Lint barrel for the `no-adhoc-row` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-row` repo-wide as
 * `error`.
 *
 * `ignores` carries exactly ONE entry, and it is not an allowlist of victims —
 * it is the definition site. Fingerprint B flags `p-row` + a hover tint as "you
 * rebuilt `Row`", and no class-level test can tell the original from an exact
 * copy, so the primitive is exempted by path. Same precedent as
 * `no-adhoc-layout`'s permanent globs for the layout primitives themselves.
 *
 * Otherwise there is no central allowlist. This rule is the exact complement of
 * `badge/no-adhoc-chip`: together they partition every rounded+padded intrinsic
 * element. The few irreducible non-rows escape via per-site markers that travel
 * WITH the code:
 *   - render through a component (capitalized host tag — skipped by fingerprint A),
 *   - use a named padding token (`p-control`/`p-chip` — excluded by A; note
 *     `p-row` is NOT an escape, it is fingerprint B's signal),
 *   - or `// eslint-disable-next-line row/no-adhoc-row -- <reason>` as a last
 *     resort.
 */
export default {
  name: "row",
  rules: {
    "no-adhoc-row": noAdhocRow,
  },
  ignores: {
    "no-adhoc-row": ["**/plugins/primitives/plugins/css/plugins/row/web/**"],
  },
};
