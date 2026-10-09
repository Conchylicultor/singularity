import {
  cn,
  SURFACE_LEVELS,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import type { ReactNode } from "react";

/**
 * The tray: ONE pill the Build control's pieces sit in — the status as a ghost
 * text button, then the Reload pill nested at its end — so the bar shows one
 * control, never a pill inside a framed pill. The collapsed bar's glance
 * renders the same tray holding only the Reload pill, so Reload is literally
 * the same control open and closed.
 *
 * It is a recessed well, so it wears the `sunken` surface role: the faint
 * hover-step fill (in the chrome, the same 6% white a ghost control hovers
 * to), and — the half that matters — it re-publishes `--hover-fill` one step
 * further, so the ghost status button inside still visibly hovers instead of
 * painting the tray's own tone onto itself. No height of its own: it hugs its
 * controls, which take the ambient control height.
 *
 * `failed` rings it in the solid destructive fill at 45% — a hairline that
 * says the last build failed without turning the whole control red.
 */
export function BuildTray({
  failed = false,
  children,
}: {
  failed?: boolean;
  children: ReactNode;
}) {
  return (
    <Line
      className={cn(
        SURFACE_LEVELS.sunken,
        "rounded-full text-foreground",
        failed && "ring-1 ring-destructive-solid/45 ring-inset",
      )}
    >
      {children}
    </Line>
  );
}
