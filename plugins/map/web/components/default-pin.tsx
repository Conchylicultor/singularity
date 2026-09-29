import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { MapPinProps } from "../slots";

/**
 * The pin of a type nobody claimed: a neutral dot in the theme's primary tone.
 * Plain on purpose — a type's owner contributes its real look through
 * `GeoMap.Pin`, and this only guarantees an unclaimed pin is still visible.
 */
export function DefaultPin({ pin, active }: MapPinProps) {
  return (
    <span
      role="img"
      aria-label={pin.label ?? "Map pin"}
      title={pin.label}
      className={cn(
        "block rounded-full border-2 border-background bg-primary shadow-md transition-transform",
        active ? "size-5 scale-110" : "size-4",
      )}
    />
  );
}
