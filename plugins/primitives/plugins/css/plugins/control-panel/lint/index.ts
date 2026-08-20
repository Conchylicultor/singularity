import noAdhocPanelBody from "./no-adhoc-panel-body";

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
 * The `ignores` list below has two tiers, and they mean opposite things:
 *
 *   1. PERMANENT — the two files that DEFINE a hairline. `dropdown-menu.tsx` and
 *      `select.tsx` are where `DropdownMenuSeparator` and the select's rule are
 *      built out of `h-px` + a border fill; that IS the sanctioned recipe, and a
 *      rule that redirects to a primitive must not police the primitive. These
 *      stay forever.
 *
 *   2. BURNDOWN — genuine hand-rolled panel bodies, measured by running the rule
 *      with an EMPTY allowlist. Every one is outside the control-panel plan's
 *      approved scope, so they are recorded rather than rewritten now. Several
 *      are literally the shape that motivated the vocabulary: a divider followed
 *      by a single footer `Row`, with cross-referencing comments explaining that
 *      each copied the other. This tier ONLY SHRINKS — migrating a file to
 *      `ControlPanel` deletes its line; nothing is ever added back. A
 *      genuinely-fixed one-off escapes per-site instead, travelling with the
 *      code:
 *
 *        // eslint-disable-next-line control-panel/no-adhoc-panel-body -- <reason>
 *
 * Three files left this tier by ceasing to be violations rather than by being
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
  rules: {
    "no-adhoc-panel-body": noAdhocPanelBody,
  },
  ignores: {
    "no-adhoc-panel-body": [
      // ── PERMANENT: the primitives that define the hairline ───────────────
      "plugins/primitives/plugins/css/plugins/ui-kit/web/components/ui/dropdown-menu.tsx",
      "plugins/primitives/plugins/css/plugins/ui-kit/web/components/ui/select.tsx",
      // ── PERMANENT: the file that BUILDS the sanctioned host ──────────────
      // Signal D says a `<ControlPanel>` under a `PopoverContent` must instead
      // be opened with `ControlPanelPopover`. This is `ControlPanelPopover` —
      // the one place that pairing is correct, because it is where
      // `padding="none"` is set. A rule that redirects to a component must not
      // police the component.
      "plugins/primitives/plugins/css/plugins/control-panel/web/internal/control-panel-popover.tsx",

      // ── BURNDOWN: EMPTY ─────────────────────────────────────────────────
      // It drained on 2026-08-19. Every panel that was here now goes through
      // `ControlPanelPopover`: callout-appearance, block-actions-menu,
      // avatar-picker, category-chip, date-filter, metronome-button,
      // page-icon-button — plus three the rule never saw at all
      // (change-cover-popover, quick-theme-panel, view-options-toggle,
      // fx-toggle), which is the interesting half: they hand-rolled a panel
      // with no divider, and the rule's signals only fire on a divider.
      //
      // Keep this tier EMPTY. An entry here is a promise to migrate, and the
      // list only ever shrank because someone kept that promise. If a new
      // hand-rolled panel appears, migrate it — do not park it.
      //
      // The rule still cannot see the whole class: a body built from Stack +
      // SectionLabel + a grid, with no hairline anywhere, is invisible to all
      // four signals. That gap is what the four files above slipped through,
      // and closing it is tracked in
      // research/2026-08-19-global-control-panel-vocabulary-v2.md.
    ],
  },
};
