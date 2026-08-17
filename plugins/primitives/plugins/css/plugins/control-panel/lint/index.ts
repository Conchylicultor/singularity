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

      // ── BURNDOWN: hand-rolled panel bodies awaiting migration ────────────
      // Popover bodies with hand-drawn hairlines or borrowed menu separators.
      "plugins/ui/plugins/theme-engine/plugins/theme-customizer/web/components/theme-customizer.tsx",
      "plugins/page/plugins/callout/web/components/callout-appearance.tsx",
      "plugins/page/plugins/editor/web/components/block-actions-menu.tsx",
      "plugins/primitives/plugins/avatar/web/components/avatar-picker.tsx",
      "plugins/conversations/plugins/conversation-category/web/components/category-chip.tsx",
      "plugins/fields/plugins/date/plugins/filter/web/components/date-filter.tsx",
      "plugins/apps/plugins/sonata/plugins/audio/plugins/metronome/web/components/metronome-button.tsx",
      "plugins/apps/plugins/pages/plugins/page-tree/web/components/page-icon-button.tsx",
      // Labelled rules drawn by hand outside a panel — these want the
      // `<Separator>` primitive rather than the control-panel vocabulary.
      "plugins/conversations/plugins/conversation-view/plugins/commits-graph/web/components/commits-graph-body.tsx",
      "plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/summary/web/components/summary-row.tsx",
    ],
  },
};
