import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { useEffect, useRef, useState } from "react"
import { MdRefresh } from "react-icons/md"

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils"
import {
  useControlSize,
  textSizeFor,
  iconSizeFor,
  buttonTextClassFor,
  type ControlSize,
  type DensityControlled,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/control-size"

const buttonVariants = cva(
  "group/button focus-ring inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        // Ghost is the ONE transparent variant — it has no background of its
        // own, so its hover tone belongs to the surface it was dropped into, not
        // to the page canvas. `bg-hover-fill` follows `--hover-fill`, which every
        // surface co-publishes (see `SURFACE_LEVELS` / the app-shell sidebar);
        // it defaults to `--muted`, so on the canvas this is byte-identical to
        // the `bg-muted` it replaces. The former `dark:hover:bg-muted/50` is
        // deliberately gone: that half-strength dark hover made ghost the only
        // control that highlighted weaker than the menu items and sidebar rows
        // beside it — the same inconsistency this token exists to remove.
        // The other variants paint their own background, so their hover is
        // relative to THEMSELVES and correctly stays a fixed token.
        ghost:
          "hover:bg-hover-fill hover:text-foreground aria-expanded:bg-hover-fill aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        md: "control-md gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        default:
          "control-md gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "control-xs gap-1 rounded-[min(var(--radius-md),10px)] px-2 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "control-sm gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "control-lg gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "control-icon-md",
        "icon-xs":
          "control-icon-xs rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "control-icon-sm rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "control-icon-lg",
        inline:
          "h-auto rounded-[min(var(--radius-md),8px)] p-0.5 align-middle text-[1em] [&_svg:not([class*='size-'])]:icon-auto",
      },
      shape: {
        default: "",
        pill: "rounded-full!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "default",
    },
  }
)

/**
 * `loading` shows a spinner and disables the button. It is also driven
 * automatically: if `onClick` returns a promise, the button enters the pending
 * state until it settles — so any async action is double-click-proof and
 * self-indicating with zero per-call-site wiring. The public `onClick` type is
 * left as base-ui's standard handler so consumers and value-returning handlers
 * keep type-checking; the promise is detected at runtime.
 */
type ButtonOwnProps = ButtonPrimitive.Props &
  Omit<VariantProps<typeof buttonVariants>, "size"> &
  DensityControlled &
  { aspect?: "text" | "icon" | "inline"; loading?: boolean }

function Button({
  className,
  variant = "default",
  aspect = "text",
  shape = "default",
  loading = false,
  disabled = false,
  onClick,
  children,
  ...props
}: ButtonOwnProps) {
  // Density (height) is ALWAYS ambient — read from `useControlSize()` (set by a
  // toolbar/slot/region), never a per-instance dial that can desync from
  // neighbors. `aspect` selects the orthogonal SHAPE axis: "text" → text density,
  // "icon" → a square icon box at that same density, "inline" → the inline escape
  // (collapses to surrounding text height). There is no per-instance density
  // override.
  const density = useControlSize()
  const resolvedSize =
    aspect === "inline"
      ? "inline"
      : aspect === "icon"
        ? iconSizeFor(density)
        : textSizeFor(density)

  // Text size flows through the shared density→text policy (textStepFor, also
  // consumed by Badge + Text). The `inline` aspect keeps its own `text-[1em]`
  // (collapses to surrounding text height), so it opts out.
  const textClass = aspect === "inline" ? undefined : buttonTextClassFor(density)

  // Auto-pending: if the handler returns a promise, reflect in-flight state
  // until it settles. Guard setState against unmount mid-flight.
  const [autoPending, setAutoPending] = useState(false)
  const mounted = useRef(true)
  useEffect(() => () => void (mounted.current = false), [])

  const handleClick: NonNullable<ButtonPrimitive.Props["onClick"]> = (event) => {
    const result = onClick?.(event) as unknown
    if (result && typeof (result as { then?: unknown }).then === "function") {
      setAutoPending(true)
      void Promise.resolve(result).finally(() => {
        if (mounted.current) setAutoPending(false)
      })
    }
  }

  const isLoading = loading || autoPending
  // Icon-shaped buttons have no label, so the spinner replaces the glyph;
  // text buttons keep their label with the spinner as a leading indicator.
  const iconOnly = resolvedSize.startsWith("icon")

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size: resolvedSize, shape }), textClass, className)}
      disabled={disabled || isLoading}
      data-loading={isLoading || undefined}
      onClick={onClick ? handleClick : undefined}
      {...props}
    >
      {isLoading ? (
        iconOnly ? (
          <MdRefresh className="animate-spin" />
        ) : (
          <>
            <MdRefresh className="animate-spin" />
            {children}
          </>
        )
      ) : (
        children
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
export type { ControlSize }
