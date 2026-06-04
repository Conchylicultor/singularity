import noAdhocChip from "./no-adhoc-chip";

/**
 * Lint barrel for the `no-adhoc-chip` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-chip` repo-wide as
 * `error`.
 *
 * `ignores` is intentionally EMPTY (no central allowlist — see the ad-hoc chip
 * guardrail plan). A file-path allowlist rots the moment code moves and reads as
 * "covered" when it isn't. Instead the rule is precise enough to fire only on
 * genuine chips (all of which have a sanctioned primitive home), and the few
 * irreducible non-chips escape via per-site markers that travel WITH the code:
 *   - render through a component (capitalized host tag — skipped by the rule),
 *   - use a named padding token (`p-chip`/`p-control` — excluded by the rule),
 *   - or `// eslint-disable-next-line badge/no-adhoc-chip -- <reason>` as a last
 *     resort.
 */
export default {
  name: "badge",
  rules: {
    "no-adhoc-chip": noAdhocChip,
  },
  ignores: {
    "no-adhoc-chip": [],
  },
};
