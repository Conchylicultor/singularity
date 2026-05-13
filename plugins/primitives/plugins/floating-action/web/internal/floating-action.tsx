import {
  type ComponentProps,
  useCallback,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

function useHoverIntent(closeDelay = 150) {
  const [hovered, setHovered] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onMouseEnter = useCallback(() => {
    clearTimeout(timeout.current);
    setHovered(true);
  }, []);

  const onMouseLeave = useCallback(() => {
    timeout.current = setTimeout(() => setHovered(false), closeDelay);
  }, [closeDelay]);

  return { hovered, onMouseEnter, onMouseLeave };
}

export interface FloatingActionProps
  extends Omit<ComponentProps<"div">, "className"> {
  variant?: "outlined" | "ghost";
  className?: string;
  panelClassName?: string;
  closeDelay?: number;
}

export function FloatingAction({
  className,
  panelClassName,
  variant = "outlined",
  closeDelay,
  children,
  ...props
}: FloatingActionProps) {
  const { hovered, onMouseEnter, onMouseLeave } = useHoverIntent(closeDelay);

  return (
    <div
      className={cn("group/fa", className)}
      data-hovered={hovered || undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
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
