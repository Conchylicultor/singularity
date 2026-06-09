import { cn } from "@/lib/utils";

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
  | "caption";

/** Foreground tone applied on top of the variant. `default` inherits the surface. */
export type TextTone = "default" | "muted" | "primary" | "destructive";

const VARIANT_CLASS: Record<TextVariant, string> = {
  title: "text-title",
  heading: "text-heading",
  subheading: "text-subheading",
  body: "text-body",
  label: "text-label",
  caption: "text-caption",
};

const TONE_CLASS: Record<TextTone, string> = {
  default: "",
  muted: "text-muted-foreground",
  primary: "text-primary",
  destructive: "text-destructive",
};

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  /** Semantic typographic variant — the only way to set size/line-height/weight. */
  variant: TextVariant;
  /** Foreground tone layered on the variant. Defaults to `default` (inherit). */
  tone?: TextTone;
  /** Host element/component. Defaults to a `span`. */
  as?: React.ElementType;
}

export function Text({
  variant,
  tone = "default",
  as: As = "span",
  className,
  children,
  ...rest
}: TextProps) {
  // Composition order variant → tone → caller className: caller wins last so
  // layout overrides (margins, truncation) compose on top of the variant bundle.
  return (
    <As className={cn(VARIANT_CLASS[variant], TONE_CLASS[tone], className)} {...rest}>
      {children}
    </As>
  );
}
