import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface KbdProps {
  className?: string;
  children: ReactNode;
}

export function Kbd({ className, children }: KbdProps) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "ml-auto inline-flex h-5 select-none items-center gap-1 rounded border border-background/30 bg-background/20 px-1 font-mono text-[0.65rem] font-medium text-background",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
