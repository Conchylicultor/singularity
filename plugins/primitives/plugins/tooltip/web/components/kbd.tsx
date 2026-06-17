import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ReactNode } from "react";

export interface KbdProps {
  className?: string;
  children: ReactNode;
}

export function Kbd({ className, children }: KbdProps) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "ml-auto inline-flex h-5 select-none items-center gap-xs rounded-md border border-border bg-muted px-xs font-mono text-2xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
