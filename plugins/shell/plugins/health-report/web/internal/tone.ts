import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { HealthLevel, HealthState } from "../../core";

/** The dot's fill for each level. Theme tokens only. */
export const DOT_CLASS: Record<HealthLevel, ClassName> = {
  ok: cn("bg-success"),
  attention: cn("bg-warning"),
  critical: cn("bg-destructive"),
  unknown: cn("bg-muted-foreground/50"),
};

/** Summary text colour: only a row that needs a look is tinted. */
export const SUMMARY_CLASS: Record<HealthLevel, ClassName> = {
  ok: cn("text-muted-foreground"),
  attention: cn("text-warning"),
  critical: cn("text-destructive"),
  unknown: cn("text-muted-foreground"),
};

/**
 * The button's tint while some row needs a look. Overrides the ghost button's
 * transparent border and neutral hover (tailwind-merge keeps the later class).
 */
export const BUTTON_TINT_CLASS: Record<
  Exclude<HealthState, "ok">,
  ClassName
> = {
  attention: cn(
    "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 hover:text-warning aria-expanded:bg-warning/20 aria-expanded:text-warning",
  ),
  critical: cn(
    "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive aria-expanded:bg-destructive/20 aria-expanded:text-destructive",
  ),
};
