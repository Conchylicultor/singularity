import {
  MdAspectRatio,
  MdClose,
  MdCropSquare,
  MdFilterNone,
  MdOpenWith,
  MdRemove,
} from "react-icons/md";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";
import type { Geometry } from "../hooks/use-window-geometry";

/** A viewport-space point the menu opens at (right-click cursor or icon corner). */
export interface MenuAnchor {
  x: number;
  y: number;
}

interface WindowSystemMenuProps {
  /** The open point, or null when the menu is closed. */
  anchor: MenuAnchor | null;
  onClose: () => void;
  geo: Geometry;
  onRestore: () => void;
  onMove: () => void;
  onSize: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onCloseWindow: () => void;
}

/**
 * The Win32-style window system menu for a floating window: Restore / Move / Size
 * / Minimize / Maximize / Close. Opened by right-clicking the titlebar or clicking
 * the window icon, both of which feed an anchor point. Built on the design-system
 * {@link DropdownMenu}; the anchor is a zero-size fixed element placed at the open
 * point, so the menu positions itself off the cursor like a native context menu.
 *
 * Item availability mirrors the chrome's own state machine: Restore is live only
 * for a snapped/maximized window, Move/Size only when not maximized, Maximize only
 * when not already maximized — so the menu can never request an impossible toggle.
 */
export function WindowSystemMenu({
  anchor,
  onClose,
  geo,
  onRestore,
  onMove,
  onSize,
  onMinimize,
  onMaximize,
  onCloseWindow,
}: WindowSystemMenuProps) {
  const maximized = geo.snap === "maximize";
  const snapped = geo.snap !== null;

  return (
    <DropdownMenu
      open={anchor !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* Zero-size anchor pinned at the open point (viewport coords from the
          triggering pointer/element), so the menu drops from the cursor. */}
      <DropdownMenuTrigger
        aria-hidden
        tabIndex={-1}
        style={{
          position: "fixed",
          left: anchor?.x ?? 0,
          top: anchor?.y ?? 0,
          width: 0,
          height: 0,
        }}
      />
      <DropdownMenuContent align="start" side="bottom">
        <DropdownMenuItem disabled={!snapped} onClick={onRestore}>
          <MdFilterNone />
          Restore
        </DropdownMenuItem>
        <DropdownMenuItem disabled={maximized} onClick={onMove}>
          <MdOpenWith />
          Move
        </DropdownMenuItem>
        <DropdownMenuItem disabled={maximized} onClick={onSize}>
          <MdAspectRatio />
          Size
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMinimize}>
          <MdRemove />
          Minimize
          <DropdownMenuShortcut>
            {formatShortcutLabel("mod+m")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={maximized} onClick={onMaximize}>
          <MdCropSquare />
          Maximize
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onCloseWindow}>
          <MdClose />
          Close
          <DropdownMenuShortcut>
            {formatShortcutLabel("mod+w")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
