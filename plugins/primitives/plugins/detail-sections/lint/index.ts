import noAdhocDetailSections from "./no-adhoc-detail-sections";

/**
 * Lint barrel for the `no-adhoc-detail-sections` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * A detail pane is ONE render slot whose sections are contributions, with the
 * host owning the chrome — `defineDetailSections` (this plugin). A hand-rolled
 * `.Section.Render` that paints its own `Surface`/`Card` per item is invisible to
 * that contract: it drifts on padding and title typography, and it silently
 * forfeits persisted open state, the `useAvailable` gate, and the
 * icon/actions/summary header.
 *
 * `ignores` exempts the sanctioned home of the chrome — this plugin's own factory,
 * which is where the one legitimate `.Section.Render`-wraps-a-card lives. Its
 * current callback returns a named helper (so it would not trip the rule today),
 * but the exemption is declared anyway: inlining that helper is a refactor the
 * primitive is entitled to make, and the rule must not be what blocks it.
 *
 * A genuinely-irreducible one-off escapes per-site, travelling with the code:
 *   // eslint-disable-next-line detail-sections/no-adhoc-detail-sections -- <reason>
 */
export default {
  name: "detail-sections",
  rules: {
    "no-adhoc-detail-sections": noAdhocDetailSections,
  },
  ignores: {
    "no-adhoc-detail-sections": [
      "plugins/primitives/plugins/detail-sections/web/internal/define-detail-sections.tsx",
    ],
  },
};
