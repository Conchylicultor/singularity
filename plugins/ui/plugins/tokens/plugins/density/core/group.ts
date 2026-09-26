import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const densityGroup = defineTokenGroup("density", {
  padChipX: { default: "0.375rem", label: "Chip padding X" },
  padChipY: { default: "0.125rem", label: "Chip padding Y" },
  padRowX: { default: "0.5rem", label: "Row padding X" },
  padRowY: { default: "0.375rem", label: "Row padding Y" },
  padCard: { default: "0.75rem", label: "Card padding" },
  // The compact (`xs`) chip rung — a count chip in a dense list row. Defaults
  // read the chip pad and the `rounded-md` radius, so a theme that leaves them
  // out paints the compact chip exactly like every other chip; a theme sets
  // them to give the dense rung its own, tighter shape.
  padChipCompactX: {
    default: "var(--pad-chip-x)",
    label: "Compact chip padding X",
  },
  padChipCompactY: {
    default: "var(--pad-chip-y)",
    label: "Compact chip padding Y",
  },
  radiusChipCompact: {
    default: "calc(var(--radius) * 0.8)",
    label: "Compact chip radius",
  },
  // A status dot's diameter per density tier (`StatusDot` reads the ambient
  // `ControlSize`). Defaults are the old `size-1` … `size-2.5`.
  statusDotXs: { default: "0.25rem", label: "Status dot XS" },
  statusDotSm: { default: "0.375rem", label: "Status dot SM" },
  statusDotMd: { default: "0.5rem", label: "Status dot MD" },
  statusDotLg: { default: "0.625rem", label: "Status dot LG" },
  // One control size = one bundle: its height, its inline padding and the gap
  // between its icon and its label. All three are tokens, so a preset owns a
  // control's width rhythm as well as its height. There is no block padding: a
  // control's height is fixed and its content centred, so it would do nothing.
  controlHeightXs: { default: "1.5rem", label: "Control height XS" },
  controlHeightSm: { default: "1.75rem", label: "Control height SM" },
  controlHeightMd: { default: "2rem", label: "Control height MD" },
  controlHeightLg: { default: "2.25rem", label: "Control height LG" },
  controlPadXs: { default: "0.5rem", label: "Control padding XS" },
  controlPadSm: { default: "0.625rem", label: "Control padding SM" },
  controlPadMd: { default: "0.625rem", label: "Control padding MD" },
  controlPadLg: { default: "0.625rem", label: "Control padding LG" },
  controlGapXs: { default: "0.25rem", label: "Control gap XS" },
  // `sm` sets the same 14px label as `md` (only `xs` drops a type rung), so
  // its gap is `md`'s: a shorter box, never a tighter label. Every preset keeps
  // the two equal.
  controlGapSm: { default: "0.375rem", label: "Control gap SM" },
  controlGapMd: { default: "0.375rem", label: "Control gap MD" },
  controlGapLg: { default: "0.375rem", label: "Control gap LG" },
  // The glyph inside a control, per size (Button's `[&_svg]`, IconButton
  // inherits). Defaults are the old `size-3` at `xs` and `size-4` above it.
  controlIconXs: { default: "0.75rem", label: "Control icon XS" },
  controlIconSm: { default: "1rem", label: "Control icon SM" },
  controlIconMd: { default: "1rem", label: "Control icon MD" },
  controlIconLg: { default: "1rem", label: "Control icon LG" },
  chromeBarH: { default: "3rem", label: "Chrome bar height" },
  chromePaneH: { default: "2.5rem", label: "Chrome pane header height" },
  chromePadX: { default: "0.75rem", label: "Chrome padding X" },
  // A pane header's own inline insets (`Bar tier="pane"`): before its leading
  // control and after its last one. Default = the shared `chromePadX`.
  chromePanePadStart: {
    default: "var(--chrome-pad-x)",
    label: "Pane header padding start",
  },
  chromePanePadEnd: {
    default: "var(--chrome-pad-x)",
    label: "Pane header padding end",
  },
  // The inline inset of a pane's secondary strip under its header
  // (`Bar tier="subpane"`, the conversation toolbar). Default = the `sm` step.
  subpanePadX: {
    default: "var(--space-sm)",
    label: "Sub-pane strip padding X",
  },
  // A conversation thread's cards (the user's message, a collapsible tool or
  // meta row): default = the `md` × `sm` steps they always wore.
  padThreadCardX: {
    default: "var(--space-md)",
    label: "Thread card padding X",
  },
  padThreadCardY: {
    default: "var(--space-sm)",
    label: "Thread card padding Y",
  },
  // The prompt box (text-editor `EditorShell`): the box's own padding, the
  // editable text's (and its placeholder's) padding inside it, and the padding
  // of the action row under the text. Defaults = none on the box, `xs` × `sm`
  // on the text, `sm` sides and an `xs` foot on the row — as always.
  padComposer: { default: "0", label: "Composer padding" },
  padComposerText: {
    default: "var(--space-xs) var(--space-sm)",
    label: "Composer text padding",
  },
  padComposerActions: {
    default: "0 var(--space-sm) var(--space-xs)",
    label: "Composer actions padding",
  },
  // A pane header's chips (a conversation's model and status chips). Default =
  // the regular chip pad.
  padChipHeaderX: {
    default: "var(--pad-chip-x)",
    label: "Header chip padding X",
  },
  padChipHeaderY: {
    default: "var(--pad-chip-y)",
    label: "Header chip padding Y",
  },
  // A transcript card's tool-name badge. It sits in an `xs` card, so the
  // defaults are the compact chip rung it always wore.
  padToolBadgeX: {
    default: "var(--pad-chip-compact-x)",
    label: "Tool badge padding X",
  },
  padToolBadgeY: {
    default: "var(--pad-chip-compact-y)",
    label: "Tool badge padding Y",
  },
  // An inline `code` span in rendered markdown. Defaults = the `xs` × `2xs`
  // steps.
  padCodeX: { default: "var(--space-xs)", label: "Inline code padding X" },
  padCodeY: { default: "var(--space-2xs)", label: "Inline code padding Y" },
  // The icon-only end segment of a split control (the send half of a prompt
  // template chip), whose width is its padding plus its glyph. Default = the
  // `xs` control pad it always had.
  padSplitArrowX: {
    default: "var(--control-pad-xs)",
    label: "Split arrow padding X",
  },
  // A conversation row's in-flight op glyph (build / push / check …). Default
  // = the old `size-3.5`.
  opStatusIcon: { default: "0.875rem", label: "Op status icon" },
  // 1-D spacing ramp — the closed set of gap/padding roles consumed by the
  // <Stack gap> / <Inset pad> primitives and the gap-*/p-* @utility classes.
  // Lives here (not a separate group) so layout rhythm scales with the active
  // density preset, exactly like control heights and pads. `none` (0) needs no
  // token. Comfortable seeds 1:1 with today's dominant raw usage (xs=gap-1,
  // sm=gap-2, md=gap-3, lg=gap-4, xl=gap-6, 2xl=gap-8).
  // Quoted kebab keys (like the type-scale group's `font-size-2xs`) so the
  // emitted vars are clean `--space-2xs … --space-2xl` — camelCase can't yield a
  // hyphen before a digit.
  "space-2xs": { default: "0.125rem", label: "Space 2xs" },
  "space-xs": { default: "0.25rem", label: "Space xs" },
  "space-sm": { default: "0.5rem", label: "Space sm" },
  "space-md": { default: "0.75rem", label: "Space md" },
  "space-lg": { default: "1rem", label: "Space lg" },
  "space-xl": { default: "1.5rem", label: "Space xl" },
  "space-2xl": { default: "2rem", label: "Space 2xl" },
});

export type DensityTokenValues = {
  [K in keyof typeof densityGroup.schema]: string;
};
