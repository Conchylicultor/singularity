import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import type { ReactNode } from "react";

export interface KbdProps {
  className?: string;
  children: ReactNode;
}

export function Kbd({ className, children }: KbdProps) {
  return (
    <Inline
      as="kbd"
      gap="xs"
      data-slot="kbd"
      className={cn(
        "ml-auto h-5 select-none rounded-md border border-border bg-muted px-xs font-mono text-2xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </Inline>
  );
}
