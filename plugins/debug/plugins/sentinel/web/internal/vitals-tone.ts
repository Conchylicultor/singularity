import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { VitalTone } from "./vitals-view";

// Theme tokens only. A neutral reading is not good or bad news by itself, so it
// wears no status colour; a stale reading wears none at all (the caller passes
// `neutral`), because its tone describes a moment that is over.

/** An emphasised value's colour. */
export const VALUE_CLASS: Record<VitalTone, string> = {
  neutral: cn("text-foreground"),
  warn: cn("text-warning"),
  bad: cn("text-destructive"),
};

/** A meter's fill. */
export const FILL_CLASS: Record<VitalTone, string> = {
  neutral: cn("bg-muted-foreground/40"),
  warn: cn("bg-warning"),
  bad: cn("bg-destructive"),
};

/** A stale block: greyed, still legible. */
export const STALE_CLASS = cn("opacity-50");
