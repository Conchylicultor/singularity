import type { CSSProperties } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { FloatingWindow } from "../hooks/use-floating-windows";
import { windowRectFraction } from "./minimap-geometry";

export interface DesktopMinimapProps {
  /** The windows living on THIS desktop (already filtered by desktopId). */
  windows: FloatingWindow[];
  /** Measured desktop backdrop size in px (`0` until first measure). */
  desktopW: number;
  /** Measured desktop backdrop size in px (`0` until first measure). */
  desktopH: number;
  /** This is the live desktop (selected read — primary ring). */
  active: boolean;
  /** The app's focused tab, so this desktop's focused window reads highlighted. */
  focusedTabId?: string | null;
  /** 1-based desktop number, shown centered only when the desktop is empty. */
  index: number;
}

/**
 * A miniature of one virtual desktop for the workspace pager: a small frame
 * standing in for the whole desktop, with every window on it painted as a
 * rounded rect at its real position/size (its x/y/w/h, or its snap tile). This
 * replaces the pager's bare `1 / 2 / 3` number — the switcher now reads as a
 * spatial overview ("which desktop has what, arranged how") rather than an
 * opaque index, matching the macOS Spaces / Win11 Task View thumbnail idiom.
 *
 * - **frame** = the desktop surface — a recessed {@link Surface} `sunken` box at
 *   the desktop's aspect ratio (`aspectRatio: W/H`, fallback `16/10`); the
 *   `active` (live) desktop gets a primary ring, the rest sit slightly dimmed so
 *   the current one pops.
 * - **windows** = one absolutely-positioned rect each, drawn back-to-front by
 *   `z` so overlaps stack like the real desktop. The focused window on the live
 *   desktop fills `bg-primary`; the rest are a muted fill with a frame-colored
 *   hairline so adjacent/overlapping windows stay legible. Minimized windows are
 *   omitted — they have left the desktop (the dock lists them), so the overview
 *   shows only what is actually on the desktop.
 * - **empty / unmeasured** = the desktop number, centered and muted, so empty
 *   desktops remain distinguishable (a populated one shows its windows instead).
 */
export function DesktopMinimap({
  windows,
  desktopW,
  desktopH,
  active,
  focusedTabId,
  index,
}: DesktopMinimapProps) {
  // Only windows actually on the desktop; back-to-front so higher z paints last.
  const visible = windows
    .filter((w) => !w.geo.minimized)
    .sort((a, b) => a.geo.z - b.geo.z);

  return (
    <Surface
      level="sunken"
      // Desktop-surface frame: an aspect-ratio box ~one control tall, recessed +
      // rounded so it reads as the desktop. `control-md` keeps it in step with
      // the dock's control heights; it is a plain non-control box so it sets its
      // own height directly. `relative overflow-hidden` makes it the positioning
      // context that clips the fractional window rects — no layout primitive
      // models a clipped fractional-coordinate canvas like this.
      // eslint-disable-next-line layout/no-adhoc-layout, control-size/no-adhoc-density -- mini-desktop frame: clips windows at arbitrary fractional positions (no positioning primitive models it) at a fixed minimap height (a non-control box, not inherited control density)
      className={cn(
        "relative block control-md overflow-hidden rounded-md border border-border/60",
        active ? "ring-2 ring-primary" : "opacity-70",
      )}
      style={{
        aspectRatio: desktopW && desktopH ? `${desktopW}/${desktopH}` : "16/10",
      }}
    >
      {visible.length === 0 ? (
        // Empty (or not-yet-measured) desktop: the number keeps it identifiable.
        <Center className="size-full">
          <Text variant="caption" tone="muted">
            {index + 1}
          </Text>
        </Center>
      ) : (
        visible.map((win) => {
          const rect = windowRectFraction(win.geo, desktopW, desktopH);
          if (!rect) return null;
          const focused =
            active && !!focusedTabId && win.activeTabId === focusedTabId;
          const style: CSSProperties = {
            left: `${rect.left * 100}%`,
            top: `${rect.top * 100}%`,
            width: `${rect.width * 100}%`,
            height: `${rect.height * 100}%`,
          };
          return (
            // A window's box on the desktop, at an arbitrary fractional position →
            // inline style; the frame-colored hairline keeps overlaps legible.
            <div
              key={win.id}
              // eslint-disable-next-line layout/no-adhoc-layout -- mini-desktop window rect at an arbitrary fractional position; no positioning primitive models it
              className={cn(
                "absolute rounded-sm border",
                focused
                  ? "border-primary/60 bg-primary"
                  : "border-background/50 bg-foreground/40",
              )}
              style={style}
            />
          );
        })
      )}
    </Surface>
  );
}
