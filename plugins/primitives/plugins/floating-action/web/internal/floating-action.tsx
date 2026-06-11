import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import {
  type ComponentProps,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const TRANSITION_DURATION = 200;

function useHoverIntent(closeDelay = 150) {
  const [hovered, setHovered] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closingRef = useRef(false);

  const onMouseEnter = useCallback(() => {
    if (closingRef.current) return;
    clearTimeout(timeout.current);
    setHovered(true);
  }, []);

  const onMouseLeave = useCallback(() => {
    timeout.current = setTimeout(() => {
      setHovered(false);
      closingRef.current = true;
      setTimeout(() => {
        closingRef.current = false;
      }, TRANSITION_DURATION);
    }, closeDelay);
  }, [closeDelay]);

  return { hovered, onMouseEnter, onMouseLeave };
}

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
  const { hovered, onMouseEnter, onMouseLeave } = useHoverIntent(closeDelay);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The morphing panel is `position: absolute`, so it contributes no intrinsic
  // size to the wrapper. Pin the wrapper to the panel's *collapsed* footprint so
  // it (a) reserves in-flow space where consumers place it in a row and (b) gives
  // the corner-anchored panel a box to grow out from. The wrapper is positioned
  // by the consumer's own className (`absolute`/`fixed`/`relative` + offsets + z),
  // so it stays glued to — and clipped by — its parent. No portal, no viewport
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
      className={cn("group/fa", className)}
      data-hovered={hovered || undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={cn("absolute w-max", anchorClasses[anchor])}>
        <div
          ref={panelRef}
          className={cn(
            "flex overflow-hidden rounded-md",
            "transition-[width,max-width,max-height,padding,background-color,box-shadow,border-color] duration-200 ease-out",
            !hovered && "pointer-events-none",
            variant === "outlined" && [
              "border border-border/60 backdrop-blur",
              "bg-background/80 group-data-hovered/fa:bg-background/90",
              "shadow-sm group-data-hovered/fa:shadow-md",
            ],
            variant === "ghost" && [
              "border border-transparent group-data-hovered/fa:border-border/60",
              "group-data-hovered/fa:bg-background/90 group-data-hovered/fa:shadow-md group-data-hovered/fa:backdrop-blur",
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
        "opacity-0 group-data-hovered/fa:opacity-100",
        "transition-opacity duration-150 group-data-hovered/fa:delay-75",
        className,
      )}
      {...props}
    />
  );
}
