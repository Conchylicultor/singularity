import noAdhocPanelBody from "./no-adhoc-panel-body";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

/**
 * Lint barrel for the `no-adhoc-panel-body` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * Panel sectioning routes through `ControlPanel` / `ControlPanel.Section`
 * (`@plugins/primitives/plugins/css/plugins/control-panel/web`), whose container
 * draws the hairline between its own direct children — never a borrowed
 * `DropdownMenuSeparator`, a `<Separator>` inside a floating panel, or an
 * `h-px bg-border` rule drawn by hand. And the body is opened by
 * `ControlPanelPopover`, never by a generic floating surface that would bring a
 * second padding role to a body that already owns its inset.
 *
 * The files that DEFINE a hairline (`ui-kit`'s `dropdown-menu.tsx` and
 * `select.tsx`, and `ControlPanelPopover` itself) declare that in their own
 * `exempt/index.ts`: a rule that redirects to a primitive must not police the
 * primitive. A genuinely-fixed one-off escapes per-site instead, travelling with
 * the code:
 *
 *   // eslint-disable-next-line control-panel/no-adhoc-panel-body -- <reason>
 *
 * Three files that once needed an exemption stopped being violations rather than being
 * migrated: `commits-graph-body.tsx`, `summary-row.tsx` and
 * `theme-customizer.tsx` each hand-drew a CENTERED LABEL FLANKED BY HAIRLINES,
 * which was never a control panel — it is a labelled `<Separator>`, and now that
 * the primitive carries the variant, the hand-drawn `h-px` the rule fired on is
 * gone. `separator.tsx` is deliberately NOT listed in exchange: it carries two
 * per-site disables with their own reasons, which says more than a whole-file
 * exemption would.
 *
 * Two shapes that looked like violations are NOT listed, deliberately, because
 * they were the rule's fault and were fixed in the rule: a separator emitted
 * from an inline `.map()` callback inside a `DropdownMenuContent`
 * (`operator-picker.tsx`), and a separator inside `CursorAnchoredMenu`, which
 * renders straight into a `DropdownMenuContent`. Allowlisting either would have
 * hidden a false positive instead of removing it.
 */
export default {
  name: "control-panel",
  rules: {},
  // Class rules are FACTORIES: they read class tokens, so they take the one
  // shared walk from `buildLintConfig` instead of hand-copying it. See
  // @plugins/framework/plugins/tooling/plugins/lint/core/class-token-walk.ts.
  classRules: {
    "no-adhoc-panel-body": noAdhocPanelBody,
  },
} satisfies LintContribution;
