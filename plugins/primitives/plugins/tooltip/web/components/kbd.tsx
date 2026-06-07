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
        "ml-auto inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1 font-mono text-2xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
