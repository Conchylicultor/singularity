import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * ButtonGroup joins 2+ controls into a single segmented/split control.
 *
 * This is the sanctioned replacement for the hand-rolled
 * `buttonVariants`-on-a-`<div>` + raw `<button>` patterns (and for manual
 * `rounded-l-none`/`rounded-r-none` on adjacent Buttons). Callers pass real
 * `<Button>` elements — or trigger wrappers that render a Button, e.g.
 * `<DropdownMenuTrigger render={<Button … />}>` or a popover trigger — as
 * direct children, all at the SAME `size`. A non-button divider (e.g. a center
 * icon between two trigger buttons) is also a valid child.
 *
 * The group is a pure LAYOUT primitive: it owns only the seam and segment
 * radii, never size or variant (those live on the child Buttons). It does not
 * clone children or inject props — arbitrary direct children pass through
 * untouched. The container carries `data-slot="button-group"`, which activates
 * the `in-data-[slot=button-group]:rounded-lg` rule already baked into the
 * Button size variants, then squares the inner corners and collapses the
 * doubled border between adjacent segments into a single seam.
 */
function ButtonGroup({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="button-group"
      className={cn(
        "inline-flex items-stretch",
        // Segment radii: first child keeps its left corners, last child keeps
        // its right corners, every inner corner is squared.
        "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none",
        // Collapse the doubled border between adjacent segments into one seam.
        "[&>*:not(:first-child)]:-ml-px",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { ButtonGroup }
