import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { MdClose, MdRemove, MdCropSquare, MdFilterNone } from "react-icons/md";
import { TabSurface, Apps, type Tab } from "@plugins/apps/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { useWindowGeometry, clampToBounds, type Bounds } from "../hooks/use-window-geometry";
import { WindowResizeHandles } from "./window-resize-handles";

interface WindowFrameProps {
  tab: Tab;
  focused: boolean;
  title: string | undefined;
  onFocus: () => void;
  onClose: () => void;
}

/**
 * One free-floating window on the desktop: a draggable/resizable frame around a
 * keep-alive {@link TabSurface}. Geometry (position, size, z, min/max state)
 * lives in the per-tab geometry store; the content stays mounted across
 * minimize so the app keeps its React state.
 */
export function WindowFrame({ tab, focused, title, onFocus, onClose }: WindowFrameProps) {
  const [geo, setGeo, bringToFront] = useWindowGeometry(tab.tabId);
  const apps = Apps.App.useContributions();
  const app = apps.find((a) => a.id === tab.appId);

  // Drag the titlebar: the `resize-handle.tsx` pointer idiom — capture the
  // pointer, translate window pointermove deltas into geometry moves, and tear
  // the listeners down on up/cancel. Disabled while maximized (no free move).
  const onTitlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (geo.maximized) return;
      e.preventDefault();
      let lastX = e.clientX;
      let lastY = e.clientY;
      // The window frame is a direct child of the desktop backdrop; its inner box
      // is the drag bound. Captured at pointer-down since it's stable for the drag.
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

  // Minimize toggle: a flag only — the content wrapper hides (display:none) but
  // stays mounted, and the frame shrinks to its titlebar strip (mirrors
  // use-column-collapse's toggle).
  const toggleMinimize = useCallback(() => {
    setGeo((g) => ({ ...g, minimized: !g.minimized }));
  }, [setGeo]);

  const Icon = app?.icon;
  const label = title ?? app?.tooltip ?? "Window";

  // Maximized windows fill the backdrop; otherwise honor the stored box. Numeric
  // inline zIndex (not a z-* class) — each window is its own stacking context, so
  // the inner app's z-nav/z-float chrome can't bleed across windows.
  const boxStyle = geo.maximized
    ? { left: 0, top: 0, right: 0, bottom: 0, zIndex: geo.z }
    : { left: geo.x, top: geo.y, width: geo.w, height: geo.h, zIndex: geo.z };

  return (
    <div
      // Focus + raise on any pointer-down inside the window, before inner
      // handlers run, so clicking a background window brings it forward first.
      onPointerDownCapture={() => {
        onFocus();
        bringToFront();
      }}
      className="absolute flex flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
      style={boxStyle}
    >
      {/* Titlebar — drag surface + window controls. */}
      <div
        onPointerDown={onTitlePointerDown}
        onDoubleClick={toggleMaximize}
        className={`flex shrink-0 items-center gap-xs border-b px-sm py-xs ${
          geo.maximized ? "" : "cursor-grab"
        } ${focused ? "bg-muted" : "bg-muted/40"}`}
        style={{ touchAction: "none" }}
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

      {/* Content — always mounted (keep-alive); hidden, not unmounted, while
          minimized so the app preserves its React state. `transform-gpu` makes
          this a containing block for the app shell's fixed sidebars, per window. */}
      <div
        className="relative min-h-0 flex-1 transform-gpu"
        style={geo.minimized ? { display: "none" } : undefined}
      >
        <TabSurface tab={tab} />
      </div>

      {/* Resize handles only in the normal state — a min/maximized window has no
          free border to drag. */}
      {!geo.minimized && !geo.maximized && <WindowResizeHandles setGeo={setGeo} />}
    </div>
  );
}
