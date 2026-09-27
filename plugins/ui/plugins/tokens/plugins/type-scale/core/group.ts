import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

// The role keys below are the closed ladder in the text plugin's `TYPE_ROLES`
// (`roleTokenKeys()` derives them). The `type-scale:closed-role-ladder` check
// holds this group to EXACTLY those keys plus the few non-role keys it lists
// (scale, base, measure, sub-scale, weights): a theme sets ROLES — never a
// component-named type token, and there is no key to mint one with.
export const typeScaleGroup = defineTokenGroup("type-scale", {
  // The one multiplier on every role's size and line height (and the sub-scale
  // and the inherited base): each `text-<role>` utility writes
  // `calc(var(--font-size-<role>) * var(--font-scale))` at the element, so
  // "make the text one step bigger" is this one value, in any scope. Weights,
  // spacing and the reading measure do not scale.
  fontScale: { default: "1", label: "Font scale" },
  // The base text every element INHERITS when no role sets its own size — set
  // at each theme-scope root (`[data-theme-scope]` in ui-kit's app.css, times
  // `--font-scale`), never on `html`, which would rescale every rem token.
  // `1rem`, not `1em`: every pane is its own nested `<Theme>` scope
  // (pane-box.tsx), so an em base would multiply the scale once per nesting
  // level. The unitless `1.5` is preflight's `html` line-height factor — a
  // length here would freeze one pixel height for every nested size.
  fontSizeBase: { default: "1rem", label: "Font size base" },
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
  // The group role: the heading of a group of rows in a list or sidebar (a
  // quiet group header, "Queue 14"). Semibold, frozen in its utility. Defaults
  // = the caption metrics such headers wore before they had a role.
  fontSizeGroup: { default: "0.75rem", label: "Font size group" },
  lineHeightGroup: { default: "1rem", label: "Line height group" },
  // The control role: the words ON a control — a button's label, a tab's
  // title. Its own role, not `body`/`label`, so a region can set its controls'
  // type without resizing the prose around them (the app chrome sets smaller,
  // regular-weight controls). Weight is a token too: the one decision the
  // frozen roles make in their utility. Its compact rung is the caption's
  // metrics at this weight.
  fontSizeControl: { default: "0.875rem", label: "Font size control" },
  lineHeightControl: { default: "1.25rem", label: "Line height control" },
  fontWeightControl: { default: "500", label: "Font weight control" },
  // The strong control: a primary action (a conversation's Stop / Restore /
  // Send). Default = the control weight every button wears.
  fontWeightControlStrong: {
    default: "var(--font-weight-control)",
    label: "Font weight strong control",
  },
  // The tag role: the words on a chip — a `Badge`, a pane header's model and
  // status chips, a transcript card's tool badge. Weight is a token (like
  // `control`) with a strong step for the badge that names a thing. Defaults
  // are the regular chip's caption size at medium weight.
  fontSizeTag: { default: "0.75rem", label: "Font size tag" },
  lineHeightTag: { default: "1rem", label: "Line height tag" },
  fontWeightTag: { default: "500", label: "Font weight tag" },
  fontWeightTagStrong: {
    default: "var(--font-weight-tag)",
    label: "Font weight strong tag",
  },
  // The tag role's own compact rung — a `Badge` at `xs` density (a count chip
  // in a dense row). Its own tokens rather than the 2xs sub-scale, so a theme
  // can set its count chips a half-step below 2xs. Defaults = the 2xs rung.
  fontSizeTagCompact: { default: "0.6875rem", label: "Font size compact tag" },
  lineHeightTagCompact: { default: "1rem", label: "Line height compact tag" },
  // The code role: monospaced text, block AND inline (`text-code`). Caption
  // size with the looser label line height — code wraps and is scanned
  // line-by-line.
  fontSizeCode: { default: "0.75rem", label: "Font size code" },
  lineHeightCode: { default: "1.25rem", label: "Line height code" },
});

export type TypeScaleTokenValues = {
  [K in keyof typeof typeScaleGroup.schema]: string;
};
