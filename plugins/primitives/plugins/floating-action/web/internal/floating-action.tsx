import {
  type ComponentProps,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const sizer = sizerRef.current;
    const panel = panelRef.current;
    if (!sizer || !panel) return;
    const { width, height } = panel.getBoundingClientRect();
    sizer.style.width = `${width}px`;
    sizer.style.height = `${height}px`;
  }, []);

  return (
    <div
      className={cn("group/fa", className)}
      data-hovered={hovered || undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div ref={sizerRef} className="relative">
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
