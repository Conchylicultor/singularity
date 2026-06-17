import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type ComponentProps, useLayoutEffect, useRef } from "react";
import { useDisclosureIntent } from "./use-disclosure-intent";

export type FloatingAnchor =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

const anchorClasses: Record<FloatingAnchor, string> = {
  "top-left": "top-0 left-0",
  "top-right": "top-0 right-0",
  "bottom-left": "bottom-0 left-0",
  "bottom-right": "bottom-0 right-0",
};

export interface FloatingActionProps
  extends Omit<ComponentProps<"div">, "className"> {
  variant?: "outlined" | "ghost";
  className?: string;
  panelClassName?: string;
  closeDelay?: number;
  anchor?: FloatingAnchor;
}

export function FloatingAction({
  className,
  panelClassName,
  variant = "outlined",
  closeDelay,
  anchor = "bottom-right",
  children,
  ...props
}: FloatingActionProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const panel = panelRef.current;
    if (!wrapper || !panel) return;
    const { width, height } = panel.getBoundingClientRect();
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={cn("group/fa outline-none", className)}
      data-open={open || undefined}
      {...rootProps}
    >
      <div className={cn("absolute w-max", anchorClasses[anchor])}>
        <div
          ref={panelRef}
          // Closed content is inert: invisible (FadeIn) panel items must not be
          // pointer- or Tab-reachable. The stable wrapper underneath still
          // receives the pointer-enter that opens it.
          inert={!open}
          // eslint-disable-next-line truncating-text/no-clip-without-nowrap -- generic morph panel: overflow-hidden clips the width/height transition, not text; single-line-ness is the consumer's call, not this primitive's
          className={cn(
            "flex overflow-hidden rounded-md",
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
