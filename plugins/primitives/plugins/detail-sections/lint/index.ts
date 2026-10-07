import noAdhocDetailSections from "./no-adhoc-detail-sections";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

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
 * This plugin's own factory is the one legitimate home of the
 * `.Section.Render`-wraps-a-card shape. Its callback returns a named helper, so
 * it does not trip the rule and needs no exemption; if it ever inlines that
 * helper it declares one in its own `exempt/index.ts`.
 *
 * A genuinely-irreducible one-off escapes per-site, travelling with the code:
 *   // eslint-disable-next-line detail-sections/no-adhoc-detail-sections -- <reason>
 */
export default {
  name: "detail-sections",
  rules: {
    "no-adhoc-detail-sections": noAdhocDetailSections,
  },
} satisfies LintContribution;
