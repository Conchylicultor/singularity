import {
  type ComponentProps,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

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
  const sizerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reserve the collapsed footprint in-flow on the (empty) spacer so surrounding
  // content lays out as if the pill lived there, and so the portaled container —
  // which mirrors the spacer's box — has a size to anchor against.
  useLayoutEffect(() => {
    const sizer = sizerRef.current;
    const panel = panelRef.current;
    if (!sizer || !panel) return;
    const { width, height } = panel.getBoundingClientRect();
    sizer.style.width = `${width}px`;
    sizer.style.height = `${height}px`;
  }, []);

  // Keep the portaled container glued over the in-flow spacer: position: fixed
  // mirroring the spacer's viewport rect, resynced on layout/scroll/resize.
  // Push-based only (ResizeObserver + capture-phase scroll/resize) — no polling.
  useLayoutEffect(() => {
    const sizer = sizerRef.current;
    const container = containerRef.current;
    if (!sizer || !container) return;

    const syncPosition = () => {
      const rect = sizer.getBoundingClientRect();
      container.style.top = `${rect.top}px`;
      container.style.left = `${rect.left}px`;
      container.style.width = `${rect.width}px`;
      container.style.height = `${rect.height}px`;
    };

    syncPosition();

    const observer = new ResizeObserver(syncPosition);
    observer.observe(sizer);

    window.addEventListener("scroll", syncPosition, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", syncPosition, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", syncPosition, { capture: true });
      window.removeEventListener("resize", syncPosition);
    };
  }, []);

  return (
    <>
      <div
        ref={sizerRef}
        className={cn("pointer-events-none", className)}
        aria-hidden
      />
      {createPortal(
        <div
          ref={containerRef}
          className="group/fa fixed z-popover"
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
        </div>,
        document.body,
      )}
    </>
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
