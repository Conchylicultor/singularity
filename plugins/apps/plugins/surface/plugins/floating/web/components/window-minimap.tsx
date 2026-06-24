import type { ComponentType, CSSProperties } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { Geometry } from "../hooks/use-floating-windows";
import type { SnapZone } from "../hooks/use-snap";

/** A normalized rect inside the desktop, every field a fraction in `0..1`. */
interface RectFraction {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The fractional box of a snap zone — `snapBox` re-expressed as plain `0..1`
 * fractions, deliberately IGNORING the {@link SNAP_GAP} gutter. At minimap
 * scale the 8px gutter is sub-pixel noise, and dropping it yields clean
 * halves/quarters (a left tile reads as exactly the left half) — far more
 * legible than a hairline-inset tile. Mirrors `snapBox`'s zone → box mapping so
 * the preview always matches where the real window actually snaps.
 */
function snapFraction(zone: SnapZone): RectFraction {
  switch (zone) {
    case "maximize":
      return { left: 0, top: 0, width: 1, height: 1 };
    case "left":
      return { left: 0, top: 0, width: 0.5, height: 1 };
    case "right":
      return { left: 0.5, top: 0, width: 0.5, height: 1 };
    case "top":
      return { left: 0, top: 0, width: 1, height: 0.5 };
    case "bottom":
      return { left: 0, top: 0.5, width: 1, height: 0.5 };
    case "top-left":
      return { left: 0, top: 0, width: 0.5, height: 0.5 };
    case "top-right":
      return { left: 0.5, top: 0, width: 0.5, height: 0.5 };
    case "bottom-left":
      return { left: 0, top: 0.5, width: 0.5, height: 0.5 };
    case "bottom-right":
      return { left: 0.5, top: 0.5, width: 0.5, height: 0.5 };
  }
}

/**
 * The window's box as `0..1` fractions of the desktop, ready to drop straight
 * onto a minimap rect's `left/top/width/height`. A snapped window resolves
 * through {@link snapFraction} (resolution-independent, so it needs no pixel
 * desktop size); a free-floating window divides its pixel box by the measured
 * desktop size, clamped to the frame so a window hanging off an edge (the
 * geometry store keeps only {@link MIN_VISIBLE}px on-screen) never paints
 * outside the minimap. Returns `null` when free-floating and the desktop has
 * not been measured yet (`dw`/`dh` still `0`), so the frame can render with just
 * its icon and no flash of a mis-scaled rect.
 */
export function windowRectFraction(
  geo: Geometry,
  dw: number,
  dh: number,
): RectFraction | null {
  if (geo.snap) return snapFraction(geo.snap);
  if (!dw || !dh) return null;
  return {
    left: clamp01(geo.x / dw),
    top: clamp01(geo.y / dh),
    width: clamp01(geo.w / dw),
    height: clamp01(geo.h / dh),
  };
}

export interface WindowMinimapProps {
  /** The window's geometry box (free pixel coords or a snap zone). */
  geo: Geometry;
  /** Measured desktop backdrop size in px (`0` until first measure). */
  desktopW: number;
  /** Measured desktop backdrop size in px (`0` until first measure). */
  desktopH: number;
  /** The active member's app icon, painted centered inside the window rect. */
  icon?: ComponentType<{ className?: string }>;
  /** This window is the focused, on-desktop one (selected read). */
  active: boolean;
  /** This window has left the desktop (dimmed + outline-only rect). */
  minimized: boolean;
  /** Member count; `> 1` shows a grouped-window count badge. */
  count: number;
}

/**
 * A macOS-Exposé-style minimap thumbnail of one floating window: a small frame
 * standing in for the whole desktop, with a smaller rect inside marking where
 * the window sits on it (its x/y/w/h, or its snap tile). This replaces the old
 * text+icon dock chip — identification is the app icon inside the rect plus the
 * dock's tooltip, freeing the dock to read as a spatial map of the desktop
 * (which window is where, how big, snapped or free) rather than a label list.
 *
 * Reads (mirroring how the old {@link ToggleChip} chip read its state):
 * - **frame** = the desktop surface — a recessed {@link Surface} `sunken` box at
 *   the desktop's aspect ratio (`aspectRatio: W/H`, fallback `16/10`); `active`
 *   adds a primary ring so the selected window's whole thumbnail lights up;
 *   `minimized` dims the entire frame.
 * - **rect** = the window on the desktop, absolutely positioned at the fraction
 *   from {@link windowRectFraction}: `active` → filled `bg-primary`; inactive →
 *   muted fill; `minimized` → outline-only (border, faint fill) to convey "off
 *   the desktop". The app icon (a {@link Center}-ed leaf) sits inside, clipped
 *   by the rect.
 * - **count** = a subtle top-right badge when the window groups several tabs.
 *
 * When the rect fraction is `null` (free window, desktop not yet measured) only
 * the centered icon paints — no flash of a mis-scaled rect before the first
 * measure.
 */
export function WindowMinimap({
  geo,
  desktopW,
  desktopH,
  icon: Icon,
  active,
  minimized,
  count,
}: WindowMinimapProps) {
  const rect = windowRectFraction(geo, desktopW, desktopH);

  // The window rect's absolute box — a genuinely bespoke fractional position no
  // layout primitive models (Pin only does corners/edges/center), so it is an
  // inline percentage style, the sanctioned escape for JS/fractional coords.
  const rectStyle: CSSProperties | undefined = rect
    ? {
        left: `${rect.left * 100}%`,
        top: `${rect.top * 100}%`,
        width: `${rect.width * 100}%`,
        height: `${rect.height * 100}%`,
      }
    : undefined;

  const iconClass = cn(
    "size-3",
    minimized
      ? "text-foreground/60"
      : active
        ? "text-primary-foreground"
        : "text-muted-foreground",
  );

  return (
    <Surface
      level="sunken"
      // Desktop-surface frame: an aspect-ratio box ~one control tall, recessed +
      // rounded so it reads as the desktop. `control-md` (~32px) keeps it in step
      // with the dock's control heights; it is a plain non-control box, so it
      // sets its own height directly. `relative overflow-hidden` makes it the
      // positioning context that clips the fractional window rect — no layout
      // primitive models a clipped fractional-coordinate canvas like this.
      // eslint-disable-next-line layout/no-adhoc-layout, control-size/no-adhoc-density -- minimap desktop frame: clips an arbitrary fractional rect (no positioning primitive models it) at a fixed minimap height (a non-control box, not inherited control density)
      className={cn(
        "relative block control-md overflow-hidden rounded-md border border-border/60",
        active && "ring-2 ring-primary",
        minimized && "opacity-50",
      )}
      style={{
        aspectRatio: desktopW && desktopH ? `${desktopW}/${desktopH}` : "16/10",
      }}
    >
      {rectStyle ? (
        // The window's box on the desktop, at an arbitrary fractional position →
        // inline style; Center places the app icon, the rect itself clips it.
        // eslint-disable-next-line layout/no-adhoc-layout -- minimap window rect at an arbitrary fractional position; no positioning primitive models it
        <div className="absolute overflow-hidden rounded-sm" style={rectStyle}>
          <Center
            className={cn(
              "size-full",
              minimized
                ? "border border-foreground/50 bg-foreground/5"
                : active
                  ? "bg-primary"
                  : "bg-foreground/30",
            )}
          >
            {Icon ? <Icon className={iconClass} /> : null}
          </Center>
        </div>
      ) : (
        // No measured fraction yet (free window, desktop unmeasured): paint just
        // the centered icon so there's no flash of a mis-scaled rect.
        Icon ? (
          <Center className="size-full">
            <Icon className={iconClass} />
          </Center>
        ) : null
      )}
      {count > 1 ? (
        <Pin to="top-right" offset="2xs" decorative>
          <Text variant="caption" tone="muted">
            {count}
          </Text>
        </Pin>
      ) : null}
    </Surface>
  );
}
