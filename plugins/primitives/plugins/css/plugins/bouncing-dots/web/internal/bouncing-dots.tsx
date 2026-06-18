import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface BouncingDotsProps {
  /** Dot diameter. `sm` = size-1 (inline, e.g. tool-call running state), `md` = size-1.5 (default). */
  size?: "sm" | "md";
  className?: string;
}

// Staggered delays give the classic left-to-right bounce wave.
const DELAYS = [0, 150, 300];

export function BouncingDots({ size = "md", className }: BouncingDotsProps) {
  return (
    <span className={cn("flex shrink-0 items-center gap-xs", className)}>
      {DELAYS.map((delay) => (
        <span
          key={delay}
          className={cn(
            "animate-bounce rounded-full bg-muted-foreground/40",
            size === "sm" ? "size-1" : "size-1.5",
          )}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
