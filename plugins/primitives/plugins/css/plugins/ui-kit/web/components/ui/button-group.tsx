import type { ComponentProps } from "react";

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web/lib/utils";

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
 * the `in-data-[slot=button-group]:rounded-control` rule already baked into the
 * Button size variants, then squares the inner corners and collapses the
 * doubled border between adjacent segments into a single seam.
 *
 * `shape="pill"` rounds the group's two OUTER ends fully — the split pill: a
 * main action with its companions as segments, read as one capsule. It is a
 * group property, not a Button one: `<Button shape="pill">` rounds all four
 * corners of one button, which inside a group would round the seams too.
 *
 * A `display:contents` child is see-through: the segment is the element inside
 * it. That is the box a slot contribution rendered with `renderIsolated` sits
 * in (it carries the contribution's lineage attributes and generates no box),
 * so a group can take segments other plugins contribute.
 *
 * "First" and "last" count only real segments: elements carrying
 * `data-button-group-segment` (set by Button and SidebarMenuButton, after their
 * incoming props so a trigger cannot overwrite it), or a `display:contents`
 * box holding one. Anything else is skipped when finding the ends: an open
 * popover or menu puts hidden elements inside the group (focus-guard spans
 * beside its trigger, and an `aria-owns` span where its panel portals from),
 * and a divider is not an end. A control that is not a Button and wants to be
 * an end segment must carry the marker too.
 */
function ButtonGroup({
  className,
  children,
  shape = "default",
  ...props
}: ComponentProps<"div"> & { shape?: "default" | "pill" }) {
  return (
    <div
      data-slot="button-group"
      className={cn(
        "inline-flex items-stretch",
        // Segment radii: the first segment keeps its left corners, the last
        // keeps its right corners, every inner corner is squared. Only marked
        // segments count (see the doc comment).
        "[&>:not(:nth-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment]))))]:rounded-l-none [&>:not(:nth-last-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment]))))]:rounded-r-none",
        "[&>.contents:not(:nth-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment]))))>*]:rounded-l-none [&>.contents:not(:nth-last-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment]))))>*]:rounded-r-none",
        shape === "pill" &&
          "[&>:nth-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment])))]:rounded-l-full [&>:nth-last-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment])))]:rounded-r-full [&>.contents:nth-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment])))>*]:rounded-l-full [&>.contents:nth-last-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment])))>*]:rounded-r-full",
        // A split pill pads its two outer ends for their roundness: the first
        // segment's start and the last segment's end take the shape group's
        // pill extra (`pill-start` / `pill-end`), exactly as a whole pill
        // button's two ends do. The seams stay square and unpadded.
        shape === "pill" &&
          "[&>:nth-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment])))]:pill-start [&>:nth-last-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment])))]:pill-end [&>.contents:nth-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment])))>*]:pill-start [&>.contents:nth-last-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment])))>*]:pill-end",
        // Collapse the doubled border between adjacent segments into one seam.
        "[&>:not(:nth-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment]))))]:-ml-px [&>.contents:not(:nth-child(1_of_:is([data-button-group-segment],.contents:has(>[data-button-group-segment]))))>*]:-ml-px",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { ButtonGroup };
