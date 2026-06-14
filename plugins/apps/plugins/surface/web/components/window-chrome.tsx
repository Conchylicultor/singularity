import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { MdClose, MdRemove, MdCropSquare, MdFilterNone } from "react-icons/md";
import { Apps } from "@plugins/apps/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { clampToBounds, type Bounds, type Geometry } from "../hooks/use-window-geometry";
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

  // Drag the titlebar: the `resize-handle.tsx` pointer idiom — capture the
  // pointer, translate window pointermove deltas into geometry moves, and tear
  // the listeners down on up/cancel. Disabled while maximized (no free move).
  const onTitlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (geo.maximized) return;
      e.preventDefault();
      let lastX = e.clientX;
      let lastY = e.clientY;
      // Titlebar → tab container → surface backdrop: the backdrop is the drag
      // bound. Captured at pointer-down since it's stable for the drag.
      const backdrop = e.currentTarget.parentElement?.parentElement ?? null;
      const bounds: Bounds | null = backdrop
        ? { width: backdrop.clientWidth, height: backdrop.clientHeight }
        : null;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (dx !== 0 || dy !== 0)
          setGeo((g) => {
            const moved = { ...g, x: g.x + dx, y: g.y + dy };
            return bounds ? clampToBounds(moved, bounds) : moved;
          });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [geo.maximized, setGeo],
  );

  // Maximize toggle: stash the current box as `restore`, then fill the backdrop;
  // toggling off restores the stashed box (mirrors use-column-maximize's toggle).
  const toggleMaximize = useCallback(() => {
    setGeo((g) =>
      g.maximized
        ? { ...g, maximized: false, ...(g.restore ?? {}), restore: undefined }
        : { ...g, maximized: true, restore: { x: g.x, y: g.y, w: g.w, h: g.h } },
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
        className={`absolute inset-x-0 top-0 z-raised flex shrink-0 items-center gap-xs border-b px-sm py-xs ${
          geo.maximized ? "" : "cursor-grab"
        } ${focused ? "bg-muted" : "bg-muted/40"}`}
        style={{ height: WINDOW_TITLEBAR_INSET, touchAction: "none" }}
      >
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        <Text variant="label" as="span" className="min-w-0 flex-1 truncate">
          {label}
        </Text>
        {/* Each control stops the pointer so it never starts a window drag. */}
        <div onPointerDown={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-2xs">
          <IconButton icon={MdRemove} label="Minimize" size="icon-sm" onClick={toggleMinimize} />
          <IconButton
            icon={geo.maximized ? MdFilterNone : MdCropSquare}
            label={geo.maximized ? "Restore" : "Maximize"}
            size="icon-sm"
            onClick={toggleMaximize}
          />
          <IconButton icon={MdClose} label="Close" size="icon-sm" onClick={onClose} />
        </div>
      </div>

      {/* Resize handles only in the normal state — a min/maximized window has no
          free border to drag. */}
      {!geo.minimized && !geo.maximized && <WindowResizeHandles setGeo={setGeo} />}
    </>
  );
}
