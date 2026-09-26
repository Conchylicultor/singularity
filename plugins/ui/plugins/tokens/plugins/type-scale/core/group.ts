import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const typeScaleGroup = defineTokenGroup("type-scale", {
  // The base text every element INHERITS when no role sets its own size — set
  // at each theme-scope root (`:root, [data-theme-scope]` in ui-kit's app.css),
  // never on `html`, which would rescale every rem token. The defaults are
  // exactly what a scope root inherited before these existed: `1em` is the
  // parent's size (no change anywhere) and the unitless `1.5` is preflight's
  // `html` line-height factor — a length here would freeze one pixel height
  // for every nested size.
  fontSizeBase: { default: "1em", label: "Font size base" },
  lineHeightBase: { default: "1.5", label: "Line height base" },
  // The reading measure (`max-w-reading`: a transcript, a document column).
  // `75ch` follows the text it measures, so a theme that shrinks its base font
  // also narrows its column; such a theme pins the measure here instead.
  measureReading: { default: "75ch", label: "Reading measure" },
  "font-size-2xs": { default: "0.6875rem", label: "Font size 2xs" },
  "font-size-3xs": { default: "0.625rem", label: "Font size 3xs" },
  "line-height-2xs": { default: "1rem", label: "Line height 2xs" },
  "line-height-3xs": { default: "0.875rem", label: "Line height 3xs" },
  fontWeightNormal: { default: "400", label: "Font weight normal" },
  fontWeightMedium: { default: "500", label: "Font weight medium" },
  fontWeightSemibold: { default: "600", label: "Font weight semibold" },
  fontWeightBold: { default: "700", label: "Font weight bold" },
  // The display rung: a landing/marketing headline, the one type size above
  // `title`. It exists so a hero headline is a ROLE like every other size and
  // not an arbitrary `text-[3rem]` beside the closed scale.
  fontSizeDisplay: { default: "3rem", label: "Font size display" },
  fontSizeTitle: { default: "1.25rem", label: "Font size title" },
  fontSizeHeading: { default: "1.125rem", label: "Font size heading" },
  fontSizeSubheading: { default: "1rem", label: "Font size subheading" },
  fontSizeBody: { default: "0.875rem", label: "Font size body" },
  fontSizeLabel: { default: "0.8125rem", label: "Font size label" },
  fontSizeCaption: { default: "0.75rem", label: "Font size caption" },
  lineHeightDisplay: { default: "3.25rem", label: "Line height display" },
  lineHeightTitle: { default: "1.75rem", label: "Line height title" },
  lineHeightHeading: { default: "1.625rem", label: "Line height heading" },
  lineHeightSubheading: { default: "1.5rem", label: "Line height subheading" },
  lineHeightBody: { default: "1.5rem", label: "Line height body" },
  lineHeightLabel: { default: "1.25rem", label: "Line height label" },
  lineHeightCaption: { default: "1rem", label: "Line height caption" },
  // The control role: the words ON a control — a button's label, a tab's
  // title. Its own role, not `body`/`label`, so a region can set its controls'
  // type without resizing the prose around them (the app chrome sets smaller,
  // regular-weight controls). Weight is a token too: the one decision the
  // other roles freeze in their utility.
  fontSizeControl: { default: "0.875rem", label: "Font size control" },
  lineHeightControl: { default: "1.25rem", label: "Line height control" },
  fontWeightControl: { default: "500", label: "Font weight control" },
  // The control role's compact (`xs`) rung — a Button at `xs` density. Defaults
  // are the caption size and line height it always wore, so only a theme that
  // sets them gives its dense controls their own type.
  fontSizeControlCompact: {
    default: "var(--font-size-caption)",
    label: "Font size compact control",
  },
  lineHeightControlCompact: {
    default: "var(--line-height-caption)",
    label: "Line height compact control",
  },
  // The compact chip rung: a `Badge` at `xs` density (a count chip in a dense
  // row). Defaults are what that chip always wore — the 2xs size and line
  // height at medium weight — so only a theme that sets them changes it.
  fontSizeChipCompact: {
    default: "var(--font-size-2xs)",
    label: "Font size compact chip",
  },
  lineHeightChipCompact: {
    default: "var(--line-height-2xs)",
    label: "Line height compact chip",
  },
  fontWeightChipCompact: {
    default: "var(--font-weight-medium)",
    label: "Font weight compact chip",
  },
  // The strong control: a primary action (a conversation's Stop / Restore /
  // Send). Default = the control weight every button wears.
  fontWeightControlStrong: {
    default: "var(--font-weight-control)",
    label: "Font weight strong control",
  },
  // A pane header's chips (a conversation's model and status chips). Defaults
  // = the regular chip's caption size at medium weight.
  fontSizeChipHeader: {
    default: "var(--font-size-caption)",
    label: "Font size header chip",
  },
  lineHeightChipHeader: {
    default: "var(--line-height-caption)",
    label: "Line height header chip",
  },
  fontWeightChipHeader: {
    default: "var(--font-weight-medium)",
    label: "Font weight header chip",
  },
  // A transcript card's tool-name badge. It sits in an `xs` card, so the
  // defaults are the compact chip rung it always wore.
  fontSizeToolBadge: {
    default: "var(--font-size-chip-compact)",
    label: "Font size tool badge",
  },
  lineHeightToolBadge: {
    default: "var(--line-height-chip-compact)",
    label: "Line height tool badge",
  },
  fontWeightToolBadge: {
    default: "var(--font-weight-chip-compact)",
    label: "Font weight tool badge",
  },
  // An inline `code` span in rendered markdown. Defaults = the caption rung.
  fontSizeCode: {
    default: "var(--font-size-caption)",
    label: "Font size inline code",
  },
  lineHeightCode: {
    default: "var(--line-height-caption)",
    label: "Line height inline code",
  },
  // A count beside a toolbar glyph (the conversation toolbar's "3", "+387").
  // Defaults = the caption rung at regular weight.
  fontSizeCount: {
    default: "var(--font-size-caption)",
    label: "Font size count",
  },
  lineHeightCount: {
    default: "var(--line-height-caption)",
    label: "Line height count",
  },
  fontWeightCount: {
    default: "var(--font-weight-normal)",
    label: "Font weight count",
  },
});

export type TypeScaleTokenValues = {
  [K in keyof typeof typeScaleGroup.schema]: string;
};
