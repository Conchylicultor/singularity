import noAdhocRow from "./no-adhoc-row";
import noRowFocusClass from "./no-row-focus-class";

/**
 * Lint barrel for the row rules. The root `eslint.config.ts` auto-discovers this
 * default export and registers each rule repo-wide as `error`.
 *
 * Two rules, the two ways a row goes wrong:
 *   - `no-adhoc-row` — the row shape rebuilt outside the primitive.
 *   - `no-row-focus-class` — the row's focus indicator authored on top of the
 *     primitive's own.
 *
 * ## `no-adhoc-row`
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
 *
 * ## `no-row-focus-class`
 *
 * `ignores` carries the SAME single glob, for the same reason: `row/web/**` is
 * where the app's canonical focus ring (`focus-ring` + `focus-ring-from`) is
 * actually applied, and a class-level test cannot tell that definition site from
 * a call site copying it. Everywhere else a focus/ring class on a `Row` is dead
 * (the box stops being the focused node once the row splits) or a double-draw,
 * so there is no allowlist tier: delete the styling, reach for `selected` if you
 * meant "current row", or `// eslint-disable-next-line row/no-row-focus-class --
 * <reason>` as a last resort.
 */
export default {
  name: "row",
  rules: {
    "no-adhoc-row": noAdhocRow,
    "no-row-focus-class": noRowFocusClass,
  },
  ignores: {
    "no-adhoc-row": ["**/plugins/primitives/plugins/css/plugins/row/web/**"],
    "no-row-focus-class": [
      "**/plugins/primitives/plugins/css/plugins/row/web/**",
    ],
  },
};
