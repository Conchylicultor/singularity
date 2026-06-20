import { cn, useSingleLine } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * The closed set of semantic typographic roles. Each role maps to a frozen
 * size + line-height + weight (+ tracking) bundle defined as a `text-<role>`
 * `@utility` in app.css, backed by the typography token group's runtime vars.
 * Pick a role, never a raw size — the `no-adhoc-typography` lint rule enforces
 * this repo-wide.
 */
export type TextVariant =
  | "title"
  | "heading"
  | "subheading"
  | "body"
  | "label"
  | "caption"
  | "eyebrow";

/** Foreground tone applied on top of the variant. `default` inherits the surface. */
export type TextTone = "default" | "muted" | "primary" | "destructive";

/** Which edge keeps its text when single-line. `end` ellipsizes the tail; `start` ellipsizes the lead. */
export type TruncateSide = "end" | "start";

const VARIANT_CLASS: Record<TextVariant, string> = {
  title: "text-title",
  heading: "text-heading",
  subheading: "text-subheading",
  body: "text-body",
  label: "text-label",
  caption: "text-caption",
  // Eyebrow/overline role: caption geometry + the small-caps treatment, single
  // line. Tone stays orthogonal — pair with `tone="muted"` for the classic
  // section label (see the SectionLabel helper).
  eyebrow: "text-caption uppercase tracking-wide whitespace-nowrap",
};

const TONE_CLASS: Record<TextTone, string> = {
  default: "",
  muted: "text-muted-foreground",
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
 * block `<div>` (such as `Frame`'s node-slot wrapper). `inline-block` makes the box
 * always honor overflow (a flex/grid item blockifies `inline-block` → `block` exactly
 * as it would `inline`, so the row case is unchanged); `max-w-full` caps it at its
 * container so it ellipsizes against the parent instead of overflowing.
 */
function singleLineLeafClass(): string {
  return "inline-block max-w-full min-w-0 truncate";
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
  // Auto-derive the hover tooltip from string children when truncating, so the
  // clipped content stays discoverable (the role TruncatingText used to fill). An
  // explicit `title` always wins; outside a single-line context we add none (a
  // wrapping paragraph shouldn't carry a giant title).
  const resolvedTitle =
    title ?? (singleLine && typeof children === "string" ? children : undefined);

  // Composition order variant → tone → single-line leaf → caller className:
  // caller wins last so layout overrides (margins, width caps) compose on top.
  const typography = cn(variant && VARIANT_CLASS[variant], TONE_CLASS[tone]);

  if (singleLine && side === "start") {
    return (
      <As
        dir="rtl"
        title={resolvedTitle}
        className={cn(typography, singleLineLeafClass(), "text-left", className)}
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
