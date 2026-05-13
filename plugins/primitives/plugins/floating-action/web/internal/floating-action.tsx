import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export interface FloatingActionProps extends ComponentProps<"div"> {}

export function FloatingAction({ className, ...props }: FloatingActionProps) {
  return (
    <div
      className={cn(
        "group/fa overflow-hidden rounded-md",
        "border border-border/60 backdrop-blur",
        "bg-background/80 group-hover/fa:bg-background/90",
        "shadow-sm group-hover/fa:shadow-md",
        "transition-[width,max-width,max-height,padding,background-color,box-shadow] duration-200 ease-out",
        className,
      )}
      {...props}
    />
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
        "opacity-0 group-hover/fa:opacity-100",
        "transition-opacity duration-150 delay-75",
        className,
      )}
      {...props}
    />
  );
}
