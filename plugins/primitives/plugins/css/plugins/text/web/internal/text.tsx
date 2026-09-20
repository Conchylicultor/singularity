import {
  cn,
  useSingleLine,
  useControlSize,
  textStepFor,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * The closed set of semantic typographic roles. Each role maps to a frozen
 * size + line-height + weight (+ tracking) bundle defined as a `text-<role>`
 * `@utility` in app.css, backed by the typography token group's runtime vars.
 * Pick a role, never a raw size — the `no-adhoc-typography` lint rule enforces
 * this repo-wide.
 */
export type TextVariant =
  | "display"
  | "title"
  | "heading"
  | "subheading"
  | "body"
  | "label"
  | "control"
  | "caption"
  | "eyebrow"
  | "code";

/** Foreground tone applied on top of the variant. `default` inherits the surface. */
export type TextTone =
  "default" | "muted" | "faint" | "primary" | "destructive";

/** Which edge keeps its text when single-line. `end` ellipsizes the tail; `start` ellipsizes the lead. */
export type TruncateSide = "end" | "start";

const VARIANT_CLASS: Record<TextVariant, string> = {
  // The landing/marketing headline rung — the one role above `title`. Bold and
  // tightly tracked; a page has at most one.
  display: "text-display",
  title: "text-title",
  heading: "text-heading",
  subheading: "text-subheading",
  body: "text-body",
  label: "text-label",
  // The words ON a control (a tab's title, beside the Buttons it sits among):
  // the same themable role Button's label wears, so a region sets both at once.
  control: "text-control",
  caption: "text-caption",
  // Eyebrow/overline role: caption geometry + the small-caps treatment, single
  // line. Tone stays orthogonal — pair with `tone="muted"` for the classic
  // section label (see the SectionLabel helper).
  eyebrow: "text-caption uppercase tracking-wide whitespace-nowrap",
  // Monospaced running text — log lines, code blocks, math source. The role owns
  // the mono FAMILY as well as the metrics, so "code" is one decision.
  code: "text-code",
};

/**
 * The compact rung for each variant — the weight/tracking-preserving `-compact`
 * utility, swapped in when the ambient `ControlSize` is `xs` (textStepFor === 1).
 * Mirrors `VARIANT_CLASS` exactly; eyebrow composes `text-caption-compact` with
 * its small-caps treatment. The threshold is owned by the single density→text
 * policy (`textStepFor`), shared with `Button` and `Badge`.
 */
const COMPACT_VARIANT_CLASS: Record<TextVariant, string> = {
  display: "text-display-compact",
  title: "text-title-compact",
  heading: "text-heading-compact",
  subheading: "text-subheading-compact",
  body: "text-body-compact",
  label: "text-label-compact",
  control: "text-control-compact",
  caption: "text-caption-compact",
  eyebrow: "text-caption-compact uppercase tracking-wide whitespace-nowrap",
  code: "text-code-compact",
};

const TONE_CLASS: Record<TextTone, string> = {
  default: "",
  muted: "text-muted-foreground",
  faint: "text-faint-foreground",
  primary: "text-primary",
  destructive: "text-destructive",
};

/**
 * The single home for the single-line truncation recipe — the body `TruncatingText`
 * used to own, now folded into `Text`.
 *
 * `truncate` (`overflow:hidden` + `text-overflow:ellipsis`) only takes effect on a
 * box that establishes a block formatting context — a block/inline-block element or
 * a flex/grid item (which CSS *blockifies*). A plain inline `<span>` silently no-ops
 * and the text overflows OUTSIDE a flex/grid row — e.g. as a node child of a plain
 * block `<div>` (such as `Frame`'s node-slot wrapper). `max-w-full` caps the box at
 * its container so it ellipsizes against the parent instead of overflowing.
 *
 * `block`, and not `inline-block`, because of where the LINE the leaf sits on ends.
 * An inline-level box whose overflow is not `visible` hands its line the bottom of
 * its own margin box as its baseline. So a truncating leaf dropped in a plain block
 * parent — which `<Fill>` is — sat with its whole box above the parent's baseline,
 * and the parent still had to leave room below that baseline for its own strut's
 * descender. The cell came out ~6px taller than the words in it, at 16px/24px, and
 * every row that centred an icon against that cell put the icon ~3px below the text
 * it labelled — the canonical `Line > Icon + Fill(Text)` recipe, and a `<Text>` sits
 * directly in a `<Fill>` at ~57 places, every one of them wrong the same way.
 * Going block-level removes the inline formatting context altogether, so
 * there is no strut and the parent's height is exactly the leaf's — exact at every
 * font-size pairing, which `vertical-align: top` is not (it only helps while the
 * leaf's line-height is at least the parent's).
 *
 * It is the `Badge` baseline incident one layer down (see `badge.tsx`, where an
 * inline-flex chip handed a sentence its ICON's bottom edge and carried the label
 * ~3.5px off the words beside it). Same class of bug: a box quietly offering the
 * line a baseline that is not its text's.
 *
 * `w-fit` then restores what `inline-block` was also giving for free — shrink-to-fit
 * width, so a `hover:underline` or a background still ends where the words end
 * rather than spanning the cell. It changes nothing in a flex or grid parent (there
 * the item is blockified and already content-sized, and `max-w-full` has always
 * clamped the flex base size), and in a plain block parent it reproduces the old
 * width to the pixel.
 */
function singleLineLeafClass(): string {
  return "block w-fit max-w-full min-w-0 truncate";
}

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Semantic typographic variant — the only way to set size/line-height/weight.
   * Optional: omit to INHERIT the surrounding typography (the text leaf that sits
   * in a row/header styled by its parent — the role `TruncatingText` used to fill).
   */
  variant?: TextVariant;
  /** Foreground tone layered on the variant. Defaults to `default` (inherit). */
  tone?: TextTone;
  /** Host element/component. Defaults to a `span`. */
  as?: React.ElementType;
  /**
   * Which edge keeps its text when the ambient context is single-line. `end`
   * (default) ellipsizes the tail (`foo/bar/lo…`); `start` ellipsizes the leading
   * chars and keeps the tail visible (`…/bar/baz.ts`) — the right default for file
   * paths and long identifiers. Inert outside a single-line container.
   */
  side?: TruncateSide;
}

/**
 * The semantic text leaf. `variant` picks a frozen typographic role (or inherits
 * when omitted); whether it truncates is NOT its own decision — it reads the
 * ambient `SingleLine` context (`useSingleLine`). Inside a LINE container
 * (`Frame`/`Row`/`Bar`/collapsible header) it ellipsizes on one line; inside a
 * FLOW container (`Stack`/`Column`/`Cluster`/`Inline`) it wraps. There is NO
 * truncation on/off prop — "non-truncating text in a line container" is a
 * contradiction, so misuse is structurally impossible: choose the right container.
 *
 * `side="start"` flips the ellipsis to the leading edge via the RTL technique: the
 * host is laid out `dir="rtl"` (so `text-overflow` clips at the visual start, with
 * `text-left` keeping the tail flush-left) while the children are isolated in a
 * `dir="ltr"` run so the path still reads left-to-right.
 */
export function Text({
  variant,
  tone = "default",
  as: As = "span",
  side = "end",
  className,
  children,
  title,
  ...rest
}: TextProps) {
  const singleLine = useSingleLine();
  // Type size tracks the ambient control density via the single density→text
  // policy: at `xs` each variant swaps for its weight-preserving `-compact` rung.
  // An omitted variant inherits the surrounding typography — nothing to compact.
  const compact = textStepFor(useControlSize()) === 1;
  // Auto-derive the hover tooltip from string children when truncating, so the
  // clipped content stays discoverable (the role TruncatingText used to fill). An
  // explicit `title` always wins; outside a single-line context we add none (a
  // wrapping paragraph shouldn't carry a giant title).
  const resolvedTitle =
    title ??
    (singleLine && typeof children === "string" ? children : undefined);

  // Composition order variant → tone → single-line leaf → caller className:
  // caller wins last so layout overrides (margins, width caps) compose on top.
  const variantClass = variant
    ? (compact ? COMPACT_VARIANT_CLASS : VARIANT_CLASS)[variant]
    : undefined;
  const typography = cn(variantClass, TONE_CLASS[tone]);

  if (singleLine && side === "start") {
    return (
      <As
        dir="rtl"
        title={resolvedTitle}
        className={cn(
          typography,
          singleLineLeafClass(),
          "text-left",
          className,
        )}
        {...rest}
      >
        <span dir="ltr" style={{ unicodeBidi: "embed" }}>
          {children}
        </span>
      </As>
    );
  }

  return (
    <As
      title={resolvedTitle}
      className={cn(typography, singleLine && singleLineLeafClass(), className)}
      {...rest}
    >
      {children}
    </As>
  );
}

/**
 * The typography role as a CLASS STRING, for the elements `<Text>` cannot be.
 *
 * The same own-it-⇒-component / don't-⇒-the-helper split the layout primitives
 * draw: a `<pre>` shiki writes into, a div with `dangerouslySetInnerHTML`, a
 * Lexical input — those must THEMSELVES carry the metrics, so there is nothing
 * to wrap. Reach for `<Text variant>` whenever you own the element.
 *
 * Returns the base rung. Unlike `<Text>` this reads no ambient `ControlSize`
 * (it is a plain function, not a hook), so a helper-styled box does not compact
 * with its surroundings — which is what these code surfaces already did when
 * they spelled their metrics by hand.
 */
export function textVariantClass(variant: TextVariant): string {
  return VARIANT_CLASS[variant];
}
