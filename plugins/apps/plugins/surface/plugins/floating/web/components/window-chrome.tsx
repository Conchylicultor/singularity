import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { MdClose, MdRemove, MdCropSquare, MdFilterNone } from "react-icons/md";
import { Apps } from "@plugins/apps/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { clampToBounds, type Bounds, type Geometry } from "../hooks/use-window-geometry";
import { detectSnapZone, setSnapPreview, type SnapZone } from "../hooks/use-snap";
import { WindowResizeHandles } from "./window-resize-handles";

/** Fixed titlebar height; mirrored by `WINDOW_TITLEBAR_INSET` so content clears it. */
export const WINDOW_TITLEBAR_INSET = "2.25rem";

interface WindowChromeProps {
  appId: string;
  title: string | undefined;
  focused: boolean;
  geo: Geometry;
  setGeo: (next: (g: Geometry) => Geometry) => void;
  onClose: () => void;
}

/**
 * Floating-window chrome rendered as a *sibling overlay* of the keep-alive
 * `TabSurface` (never a parent of it), so tearing a tab off / docking it never
 * remounts its content. Provides the draggable titlebar (move, bounds-clamped),
 * the minimize/maximize/close controls, and the perimeter resize handles. The
 * geometry *box* itself is applied to the stable tab container by `SurfaceBody`'s
 * `placementStyle`; this only paints the chrome on top.
 *
 * Split out of the old `WindowFrame` (which wrapped `<TabSurface>`): the wrapper
 * box-style + theme scope moved to `SurfaceBody`, the titlebar + handles became
 * this overlay.
 */
export function WindowChrome({
  appId,
  title,
  focused,
  geo,
  setGeo,
  onClose,
}: WindowChromeProps) {
  const apps = Apps.App.useContributions();
  const app = apps.find((a) => a.id === appId);

  // Drag the titlebar. A snapped/maximized window pops back to its restored free
  // box (centered under the cursor) on the first move, then free-drags. During the
  // drag the cursor's desktop edge/corner arms a snap preview; releasing over an
  // armed zone snaps the window there (storing the free box as `restore`).
  const onTitlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Titlebar → tab container → surface backdrop: the backdrop is the drag +
      // snap-detection frame. Captured at pointer-down (stable for the drag).
      const backdrop = e.currentTarget.parentElement?.parentElement ?? null;
      const rect = backdrop?.getBoundingClientRect() ?? null;
      const bounds: Bounds | null = rect
        ? { width: rect.width, height: rect.height }
        : null;

      // A free window is already "popped"; a snapped one pops on the first move.
      let popped = geo.snap === null;
      let lastX = e.clientX;
      let lastY = e.clientY;
      let zone: SnapZone | null = null;

      const onMove = (ev: PointerEvent) => {
        if (!popped) {
          // Pop the snapped window out to its restored size under the cursor.
          popped = true;
          setGeo((g) => {
            const r = g.restore ?? { x: g.x, y: g.y, w: g.w, h: g.h };
            const relX = rect ? ev.clientX - rect.left : ev.clientX;
            const relY = rect ? ev.clientY - rect.top : ev.clientY;
            const free: Geometry = {
              ...g,
              x: relX - r.w / 2,
              y: relY - 18, // ~half the titlebar height, so it lands under the cursor
              w: r.w,
              h: r.h,
              snap: null,
              restore: undefined,
            };
            return bounds ? clampToBounds(free, bounds) : free;
          });
          lastX = ev.clientX;
          lastY = ev.clientY;
          return;
        }
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (dx !== 0 || dy !== 0)
          setGeo((g) => {
            const moved = { ...g, x: g.x + dx, y: g.y + dy };
            return bounds ? clampToBounds(moved, bounds) : moved;
          });
        if (rect) {
          zone = detectSnapZone(
            ev.clientX - rect.left,
            ev.clientY - rect.top,
            rect.width,
            rect.height,
          );
          setSnapPreview(zone);
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setSnapPreview(null);
        if (zone) {
          const target = zone;
          setGeo((g) => ({
            ...g,
            snap: target,
            // Remember the free box so dragging back out / restore returns to it.
            restore: g.restore ?? { x: g.x, y: g.y, w: g.w, h: g.h },
          }));
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [geo.snap, setGeo],
  );

  // Maximize toggle, expressed as the `"maximize"` snap zone: stash the current
  // free box as `restore` (keeping an existing one when toggling from a tile),
  // then fill the backdrop; toggling off restores the stashed box.
  const toggleMaximize = useCallback(() => {
    setGeo((g) =>
      g.snap === "maximize"
        ? { ...g, snap: null, ...(g.restore ?? {}), restore: undefined }
        : {
            ...g,
            snap: "maximize",
            restore: g.restore ?? { x: g.x, y: g.y, w: g.w, h: g.h },
          },
    );
  }, [setGeo]);

  // Minimize toggle: a flag only — the content wrapper hides (handled by
  // SurfaceBody) but stays mounted; here we just flip the bit.
  const toggleMinimize = useCallback(() => {
    setGeo((g) => ({ ...g, minimized: !g.minimized }));
  }, [setGeo]);

  const Icon = app?.icon;
  const label = title ?? app?.tooltip ?? "Window";

  return (
    <>
      {/* Titlebar — absolutely pinned to the top of the window box, overlaying the
          surface (which SurfaceBody insets below it). Drag surface + controls. */}
      <div
        onPointerDown={onTitlePointerDown}
        onDoubleClick={toggleMaximize}
        className={`absolute inset-x-0 top-0 z-raised flex shrink-0 items-center gap-xs border-b px-sm py-xs cursor-grab ${
          focused ? "bg-muted" : "bg-muted/40"
        }`}
        style={{ height: WINDOW_TITLEBAR_INSET, touchAction: "none" }}
      >
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        <Text variant="label" as="span" className="min-w-0 flex-1 truncate">
          {label}
        </Text>
        {/* Each control stops the pointer so it never starts a window drag. */}
        <div onPointerDown={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-2xs">
          <IconButton
            icon={MdRemove}
            label={`Minimize (${formatShortcutLabel("mod+m")})`}
            size="icon-sm"
            onClick={toggleMinimize}
          />
          <IconButton
            icon={geo.snap === "maximize" ? MdFilterNone : MdCropSquare}
            label={geo.snap === "maximize" ? "Restore" : "Maximize"}
            size="icon-sm"
            onClick={toggleMaximize}
          />
          <IconButton
            icon={MdClose}
            label={`Close (${formatShortcutLabel("mod+w")})`}
            size="icon-sm"
            onClick={onClose}
          />
        </div>
      </div>

      {/* Resize handles only in the normal state — a min/snapped window has no
          free border to drag. */}
      {!geo.minimized && !geo.snap && <WindowResizeHandles setGeo={setGeo} />}
    </>
  );
}
