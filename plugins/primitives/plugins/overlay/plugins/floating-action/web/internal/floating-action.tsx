import {
  rampClass,
  type SpaceStep,
} from "@plugins/primitives/plugins/css/plugins/space-ramp/core";
import {
  insetClass,
  type StackAlign,
  type StackDirection,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useResizeObserver } from "@plugins/primitives/plugins/dom/plugins/element-size/web";
import { type ComponentProps, type ReactNode, useRef } from "react";
import { useDisclosureIntent } from "./use-disclosure-intent";

export type FloatingAnchor =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Which end of the panel's axis the trigger sits at; content fills the other. */
export type FloatingActionTriggerAt = "start" | "end";

const anchorClasses: Record<FloatingAnchor, string> = {
  "top-left": "top-0 left-0",
  "top-right": "top-0 right-0",
  "bottom-left": "bottom-0 left-0",
  "bottom-right": "bottom-0 right-0",
};

// The panel's flow, from the two roles that decide it. The primitive fixes the
// trigger as the FIRST DOM child (it owns the rigid collapsed-footprint
// wrapper), so "the trigger sits at the end" is a REVERSED flex direction — and
// reversal also flips where the panel packs its items, which is what keeps the
// trigger flush against a clamped panel's far edge while the content is revealed
// past the other one. Both halves are mechanics; the call site states the roles.
const FLOW_CLASS: Record<
  StackDirection,
  Record<FloatingActionTriggerAt, string>
> = {
  row: { start: "flex-row", end: "flex-row-reverse" },
  col: { start: "flex-col", end: "flex-col-reverse" },
};

const ALIGN_CLASS: Record<StackAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

export interface FloatingActionProps extends Omit<
  ComponentProps<"div">,
  "className"
> {
  variant?: "outlined" | "ghost";
  className?: string;
  /**
   * SIZING ONLY — the panel's collapsed→open morph (`max-w-*` / `max-h-*` /
   * `w-*`), which the primitive animates but deliberately does not size, since
   * the open extent is a per-call-site measurement. The panel's LAYOUT is the
   * props above (`direction` / `triggerAt` / `align` / `gap` / `pad`), and this
   * field cannot take it back: its `ClassName` brand means the value comes out
   * of `cn()`, so `no-adhoc-layout` reads its tokens and rejects any flow,
   * alignment, positioning or clipping class written here.
   */
  panelClassName?: ClassName;
  /** Axis the panel's content flows along. Defaults to `row`. */
  direction?: StackDirection;
  /** Which end of `direction` the trigger sits at. Defaults to `start`. */
  triggerAt?: FloatingActionTriggerAt;
  /** Cross-axis alignment of the trigger against the content (`items-*`). */
  align?: StackAlign;
  /** Gap between the trigger and the content, from the spacing ramp. */
  gap?: SpaceStep;
  /** Padding inside the panel, from the spacing ramp. */
  pad?: SpaceStep;
  closeDelay?: number;
  anchor?: FloatingAnchor;
  /**
   * The always-visible collapsed footprint — the element shown while the panel
   * is closed (e.g. the trigger icon/glyph). The primitive renders it in an
   * own, rigid wrapper that **never flex-shrinks**, so it can never collapse to
   * 0 even when `children` are a tall/wide sibling under a clamped panel.
   * Declare the role here; `children` hold the expanding content.
   */
  trigger: ReactNode;
  /**
   * The accessible name of the control. It lands on the stable wrapper — the
   * element that takes focus and carries `aria-expanded` — not on the panel,
   * which is `inert` while closed and so names nothing a user can reach.
   */
  label?: string;
}

export function FloatingAction({
  className,
  panelClassName,
  direction = "row",
  triggerAt = "start",
  align,
  gap,
  pad,
  variant = "outlined",
  closeDelay,
  anchor = "bottom-right",
  trigger,
  label,
  children,
  ...props
}: FloatingActionProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  // How much bigger the collapsed panel is than its trigger, per axis: the
  // panel's padding + border, plus whatever the collapsed `children` and the
  // gap add along the flow. Read once, the first time the panel has a box while
  // closed — the one moment it is guaranteed to be at rest (nothing has opened
  // it yet, so no morph can be in flight).
  const chromeRef = useRef<{ width: number; height: number } | null>(null);
  const { open, rootProps } = useDisclosureIntent(wrapperRef, closeDelay);

  // The morphing panel is `position: absolute`, so it contributes no intrinsic
  // size to the wrapper. Pin the wrapper to the panel's *collapsed* footprint so
  // it (a) reserves in-flow space where consumers place it in a row and (b) gives
  // the corner-anchored panel a box to grow out from. Crucially this keeps the
  // hover hitbox (the wrapper) a *stable* size while the panel morphs over it —
  // the structural cure for open/close flicker. The wrapper is positioned by the
  // consumer's own className (`absolute`/`fixed`/`relative` + offsets + z), so it
  // stays glued to — and clipped by — its parent. No portal, no viewport
  // tracking: native layout repositions it on every reflow, including a sibling
  // pane opening alongside it.
  //
  // "Stable" means it never follows the OPEN panel — not that it is frozen. The
  // trigger is live content (a status dot that grows into a pill with a count),
  // and while closed the panel is `inert`, so the wrapper is the only way in: a
  // hitbox left at the trigger's old size would leave the grown part of it
  // neither hoverable nor clickable. So the footprint is derived, never re-read
  // off the panel (which may be mid-morph): trigger size + the chrome measured
  // at rest. The derivation is size-only, so it holds for every `anchor`,
  // `direction` and `triggerAt` — the collapsed panel sits exactly on the
  // wrapper from whichever corner it is anchored at.
  //
  // While open, nothing is written: the hitbox holds still under the morph, and
  // a trigger that reshapes itself on open (the outline rail clips its dashes
  // away) cannot shrink it. `open` is a dep, so closing re-derives the footprint
  // at once from whatever the trigger became in the meantime.
  useResizeObserver(
    triggerRef,
    () => {
      if (open) return;
      const wrapper = wrapperRef.current;
      const panel = panelRef.current;
      const triggerBox = triggerRef.current;
      if (!wrapper || !panel || !triggerBox) return;
      const trig = triggerBox.getBoundingClientRect();
      let chrome = chromeRef.current;
      if (!chrome) {
        const rest = panel.getBoundingClientRect();
        // No box yet (mounted under a `display: none` ancestor, e.g. a
        // background tab): there is nothing to measure. The trigger's first
        // resize once it is shown brings us back here.
        if (rest.width === 0 && rest.height === 0) return;
        chrome = {
          width: rest.width - trig.width,
          height: rest.height - trig.height,
        };
        chromeRef.current = chrome;
      }
      wrapper.style.width = `${trig.width + chrome.width}px`;
      wrapper.style.height = `${trig.height + chrome.height}px`;
    },
    { deps: [open] },
  );

  return (
    <div
      ref={wrapperRef}
      className={cn("group/fa outline-none", className)}
      data-open={open || undefined}
      aria-label={label}
      {...rootProps}
    >
      <div className={cn("absolute w-max", anchorClasses[anchor])}>
        <div
          ref={panelRef}
          // Closed content is inert: invisible (FadeIn) panel items must not be
          // pointer- or Tab-reachable. The stable wrapper underneath still
          // receives the pointer-enter that opens it.
          inert={!open}
          // `overflow-hidden` here clips the width/height transition, not text.
          // `no-clip-without-nowrap` used to need a disable and no longer does:
          // the panel's direction/align come from FLOW_CLASS / ALIGN_CLASS, and
          // now that the shared walk follows those maps the rule reads the
          // `flex-col` / `items-*` in them and correctly stops calling this a
          // single-line text row.
          className={cn(
            "flex overflow-hidden rounded-md",
            FLOW_CLASS[direction][triggerAt],
            align && ALIGN_CLASS[align],
            gap && rampClass("gap", gap),
            pad && insetClass({ pad }),
            "transition-[width,max-width,max-height,padding,background-color,box-shadow,border-color] duration-200 ease-out",
            variant === "outlined" && [
              "border border-border/60 backdrop-blur",
              "bg-background/80 group-data-open/fa:bg-background/90",
              "shadow-sm group-data-open/fa:shadow-md",
            ],
            variant === "ghost" && [
              "border border-transparent group-data-open/fa:border-border/60",
              "group-data-open/fa:bg-background/90 group-data-open/fa:shadow-md group-data-open/fa:backdrop-blur",
            ],
            panelClassName,
          )}
          {...props}
        >
          {/* The trigger's rigid wrapper: this `shrink-0` is the load-bearing
              collapsed-footprint guarantee — the whole point of the slot. It
              keeps the always-visible trigger from flex-shrinking to 0 next to
              a tall/wide `children` sibling under a clamped panel. It is also
              the box whose resizes re-size the hover hitbox above. */}
          <div ref={triggerRef} className="shrink-0">
            {trigger}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export interface FloatingActionFadeInProps extends ComponentProps<"div"> {}

export function FloatingActionFadeIn({
  className,
  ...props
}: FloatingActionFadeInProps) {
  return (
    <div
      className={cn(
        "opacity-0 group-data-open/fa:opacity-100",
        "transition-opacity duration-150 group-data-open/fa:delay-75",
        className,
      )}
      {...props}
    />
  );
}
