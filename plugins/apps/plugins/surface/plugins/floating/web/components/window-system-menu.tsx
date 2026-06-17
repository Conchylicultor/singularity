import {
  MdAspectRatio,
  MdCallSplit,
  MdClose,
  MdCropSquare,
  MdFilterNone,
  MdOpenWith,
  MdPushPin,
  MdRemove,
  MdWebAsset,
} from "react-icons/md";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";
import type { Geometry, WindowId } from "../hooks/use-floating-windows";

/** A merge target offered in the "Merge into ▸" submenu (another open window). */
export interface MergeTarget {
  id: WindowId;
  title: string;
}

/** Display label for the always-on-top toggle shortcut, shared by chrome + menu. */
export const TOGGLE_PIN_SHORTCUT = "ctrl+alt+p";

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
  onTogglePin: () => void;
  onCloseWindow: () => void;
  /** Other open windows this window's active tab can be merged into. */
  mergeTargets: MergeTarget[];
  /** Merge this window's active tab into the given target window. */
  onMergeInto: (targetWindowId: WindowId) => void;
  /** Whether the window holds >1 member, so its active tab can be torn off. */
  canSplit: boolean;
  /** Tear this window's active tab out into a new window. */
  onSplit: () => void;
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
  onTogglePin,
  onCloseWindow,
  mergeTargets,
  onMergeInto,
  canSplit,
  onSplit,
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
        <DropdownMenuCheckboxItem
          checked={geo.pinned}
          onClick={onTogglePin}
        >
          <MdPushPin />
          Always on top
          <DropdownMenuShortcut>
            {formatShortcutLabel(TOGGLE_PIN_SHORTCUT)}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {/* Grouping: fold the active tab into another window, or tear it back
            out. Mirrors the (Phase 2) drag affordance as an accessible,
            non-drag path. */}
        {mergeTargets.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <MdWebAsset />
              Merge into
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {mergeTargets.map((target) => (
                <DropdownMenuItem
                  key={target.id}
                  onClick={() => onMergeInto(target.id)}
                >
                  <MdWebAsset />
                  {target.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem disabled={!canSplit} onClick={onSplit}>
          <MdCallSplit />
          Move tab to new window
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Closes the WHOLE window (every member); per-tab close is the chip ×
            and the `mod+w` shortcut, which act on the active member alone. */}
        <DropdownMenuItem variant="destructive" onClick={onCloseWindow}>
          <MdClose />
          Close window
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
