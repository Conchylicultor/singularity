import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ReactNode } from "react";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import "./loading.css";

export type LoadingVariant = "text" | "spinner" | "rows" | "cards" | "block";

export interface LoadingProps {
  /** Visual shape of the loading state. Default `"text"`. */
  variant?: LoadingVariant;
  /** Text shown by the `text` and `spinner` variants. Default `"Loading…"` (text only). */
  label?: ReactNode;
  /** Skeleton item count for `rows` (default 6) and `cards` (default 8). */
  count?: number;
  className?: string;
}

/** The atomic shimmer block every skeleton variant is built from. */
function Shimmer({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/**
 * The single entry point for the LOADING state. Orchestrates the existing
 * leaves — `text` delegates to `Placeholder`, `spinner` to `Spinner`, and the
 * skeleton variants (`rows` / `cards` / `block`) compose the shimmer atom.
 *
 * Every variant mounts invisible and fades in only after ~120ms (see
 * `loading.css`), so a fast load unmounts it before it ever paints — no flash.
 */
export function Loading({
  variant = "text",
  label,
  count,
  className,
}: LoadingProps): ReactNode {
  switch (variant) {
    case "text":
      return (
        <div role="status" className={cn("loading-delayed", className)}>
          <Placeholder>{label ?? "Loading…"}</Placeholder>
        </div>
      );
    case "spinner":
      return (
        <div
          role="status"
          className={cn(
            "loading-delayed flex items-center gap-sm px-md py-sm text-body text-muted-foreground",
            className,
          )}
        >
          <Spinner className="size-4 shrink-0" />
          {label}
        </div>
      );
    case "rows":
      return (
        <div
          role="status"
          aria-label="Loading"
          className={cn("loading-delayed flex flex-col gap-sm p-sm", className)}
        >
          {Array.from({ length: count ?? 6 }, (_, i) => (
            <Shimmer key={i} className="h-8 w-full" />
          ))}
        </div>
      );
    case "cards":
      return (
        <div
          role="status"
          aria-label="Loading"
          className={cn("loading-delayed grid gap-lg p-xl", className)}
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          }}
        >
          {Array.from({ length: count ?? 8 }, (_, i) => (
            <div key={i} className="flex flex-col gap-sm">
              <Shimmer className="aspect-video w-full" />
              <Shimmer className="h-4 w-3/5" />
            </div>
          ))}
        </div>
      );
    case "block":
      return (
        <div role="status" aria-label="Loading" className={cn("loading-delayed", className)}>
          <Shimmer className="size-full" />
        </div>
      );
  }
}
