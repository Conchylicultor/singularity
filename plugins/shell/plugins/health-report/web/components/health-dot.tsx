import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { HealthLevel } from "../../core";
import { DOT_CLASS, DOT_HALO_CLASS } from "../internal/tone";

/**
 * The report's dot: coloured by level, pulsing while not known yet or while
 * transitioning. Its diameter is the ambient `ControlSize`, like every
 * `StatusDot` — the region it sits in decides it. `halo` rings it in its own
 * tone (the action bar's dot).
 */
export function HealthDot({
  level,
  pulsing,
  halo = false,
}: {
  level: HealthLevel;
  pulsing: boolean;
  halo?: boolean;
}) {
  return (
    <StatusDot
      colorClass={cn(DOT_CLASS[level], pulsing && "animate-pulse")}
      className={halo ? DOT_HALO_CLASS[level] : undefined}
    />
  );
}
