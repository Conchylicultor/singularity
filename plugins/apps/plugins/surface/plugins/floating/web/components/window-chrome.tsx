import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  MdClose,
  MdRemove,
  MdCropSquare,
  MdFilterNone,
  MdOutlinePushPin,
  MdPushPin,
  MdWebAsset,
} from "react-icons/md";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import {
  clampToBounds,
  type Bounds,
  type Desktop,
  type FloatingWindow,
  type Geometry,
  type WindowId,
} from "../hooks/use-floating-windows";
import { detectSnapZone, setSnapPreview, type SnapZone } from "../hooks/use-snap";
import {
  beginWindowInteraction,
  endWindowInteraction,
} from "../hooks/use-window-motion";
import { useWindowKeyboardInteraction } from "../hooks/use-window-interaction";
import { WindowResizeHandles } from "./window-resize-handles";
import {
  WindowTabStrip,
  type TabDragCommit,
  type WindowMember,
} from "./window-tab-strip";
import {
  TOGGLE_PIN_SHORTCUT,
  WindowSystemMenu,
  type MenuAnchor,
  type MergeTarget,
} from "./window-system-menu";

/** Fixed titlebar height; mirrored by `WINDOW_TITLEBAR_INSET` so content clears it. */
export const WINDOW_TITLEBAR_INSET = "2.25rem";

interface WindowChromeProps {
  /** The window this chrome paints (one titlebar per window — the active member). */
  window: FloatingWindow;
  focused: boolean;
  setGeo: (next: (g: Geometry) => Geometry) => void;
  /** Members in tab-strip order, resolved to title + app icon for the strip. */
  members: WindowMember[];
  /** Show + focus a member (tab-strip chip click). */
  onSelectMember: (tabId: string) => void;
  /** Close one member (chip ×). */
  onCloseMember: (tabId: string) => void;
  /** Close the WHOLE window (every member) — the right-side titlebar X. */
  onCloseWindow: () => void;
  /** Toggle this window's always-on-top flag (re-ranks z in the geometry store). */
  onTogglePin: () => void;
  /** Other open windows the active tab can be merged into ("Merge into ▸"). */
  mergeTargets: MergeTarget[];
  /** Merge the active tab into a target window. */
  onMergeInto: (targetWindowId: WindowId) => void;
  /** Tear the active tab out into a new window (enabled when grouped). */
  onSplit: () => void;
  /** Every virtual desktop, for the "Move to desktop ▸" submenu. */
  desktops: Desktop[];
  /** The desktop this window currently lives on (checked + disabled in the menu). */
  currentDesktopId: string;
  /** Move this window to an existing desktop. */
  onMoveToDesktop: (desktopId: string) => void;
  /** Move this window to a freshly-created desktop. */
  onMoveToNewDesktop: () => void;
  /** Commit ops for a finished tab-chip drag (reorder / merge / split). */
  dragCommit: TabDragCommit;
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
  window: win,
  focused,
  setGeo,
  members,
  onSelectMember,
  onCloseMember,
  onCloseWindow,
  onTogglePin,
  mergeTargets,
  onMergeInto,
  onSplit,
  desktops,
  currentDesktopId,
  onMoveToDesktop,
  onMoveToNewDesktop,
  dragCommit,
}: WindowChromeProps) {
  const geo = win.geo;
  const canSplit = win.members.length > 1;

  const titlebarRef = useRef<HTMLDivElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const openMenuAt = useCallback(
    (x: number, y: number) => setMenuAnchor({ x, y }),
    [],
  );

  // The desktop backdrop box (titlebar → tab container → backdrop), read lazily
  // so the keyboard move/size clamp matches the pointer-drag clamp.
  const getBounds = useCallback((): Bounds | null => {
    const backdrop = titlebarRef.current?.parentElement?.parentElement ?? null;
    const rect = backdrop?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height } : null;
  }, []);

  const interaction = useWindowKeyboardInteraction(geo, setGeo, getBounds);

  // Drag the titlebar. A snapped/maximized window pops back to its restored free
  // box (centered under the cursor) on the first move, then free-drags. During the
  // drag the cursor's desktop edge/corner arms a snap preview; releasing over an
  // armed zone snaps the window there (storing the free box as `restore`).
  const onTitlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Suppress the box transition for the duration of the drag, so the window
      // tracks the cursor 1:1 instead of easing behind it.
      beginWindowInteraction(win.id);
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
        // End interaction first, so the final snap commit (below) animates: this
        // and the `setGeo` batch into one render with the transition re-enabled.
        endWindowInteraction(win.id);
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
    [geo.snap, setGeo, win.id],
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

  // System-menu "Restore": pop a snapped/maximized window back to its free box
  // (and un-minimize), mirroring the maximize-toggle's restore path.
  const restore = useCallback(() => {
    setGeo((g) => ({
      ...g,
      snap: null,
      ...(g.restore ?? {}),
      restore: undefined,
      minimized: false,
    }));
  }, [setGeo]);

  // The system-menu button icon = the active member's app icon (the strip shows
  // every member, so the titlebar icon just stands in for the window menu).
  const activeMember = members.find((m) => m.tabId === win.activeTabId);
  const MenuIcon = activeMember?.icon ?? MdWebAsset;

  return (
    <>
      {/* Inactive-window dim. A pointer-events-none scrim that fades the unfocused
          window's content back toward the desktop, so the focused window's full
          color (plus its deeper shadow) makes the focus target unmistakable. Sits
          at z-raised to cover the surface content, but renders BEFORE the titlebar
          and handles (also z-raised) so those stay crisp above it. */}
      <div
        aria-hidden
        // eslint-disable-next-line layout/no-adhoc-layout -- full-bleed inactive-window dim scrim; bare absolute layer with style-driven opacity, not an Overlay wrapping content
        className="pointer-events-none absolute inset-0 z-raised bg-background transition-opacity duration-150 ease-out"
        style={{ opacity: focused ? 0 : 0.35 }}
      />

      {/* Titlebar — absolutely pinned to the top of the window box, overlaying the
          surface (which SurfaceBody insets below it). Drag surface + controls. */}
      <div
        ref={titlebarRef}
        onPointerDown={onTitlePointerDown}
        onDoubleClick={toggleMaximize}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenuAt(e.clientX, e.clientY);
        }}
        // eslint-disable-next-line layout/no-adhoc-layout -- draggable window titlebar: top-edge-pinned, fixed height via style, hand-rolled flex row whose flex-1/shrink-0 children coordinate with the move-drag region; window chrome, not a primitive row
        className={`absolute inset-x-0 top-0 z-raised flex shrink-0 items-center gap-xs border-b pr-sm pl-2xs py-xs cursor-grab ${
          focused ? "bg-muted" : "bg-muted/40"
        }`}
        style={{ height: WINDOW_TITLEBAR_INSET, touchAction: "none" }}
      >
        {/* The window icon doubles as the system-menu button (Win32 icon-click). */}
        {/* eslint-disable-next-line layout/no-adhoc-layout -- rigid leading item in the titlebar's hand-rolled drag flex (see titlebar disable above) */}
        <div onPointerDown={(e) => e.stopPropagation()} className="shrink-0">
          <ControlSizeProvider size="sm">
            <IconButton
              icon={MenuIcon}
              label="Window menu"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                openMenuAt(r.left, r.bottom);
              }}
            />
          </ControlSizeProvider>
        </div>
        {/* In-window tab strip — one chip per member. `data-floating-window-id`
            marks the drop-zone the tab-chip drag hit-tests against. The
            flex-1 wrapper soaks up the slack so the strip sits left, the empty
            remainder is the move-drag region, and the controls pin right. */}
        <div
          data-floating-window-id={win.id}
          // eslint-disable-next-line layout/no-adhoc-layout -- flexible slack region of the titlebar's hand-rolled drag flex: soaks up space so the strip sits left and the remainder is the move-drag zone (see titlebar disable above)
          className="min-w-0 flex-1"
        >
          <WindowTabStrip
            windowId={win.id}
            members={members}
            activeTabId={win.activeTabId}
            onSelect={onSelectMember}
            onCloseMember={onCloseMember}
            commit={dragCommit}
          />
        </div>
        {/* Each control stops the pointer so it never starts a window drag. */}
        {/* eslint-disable-next-line layout/no-adhoc-layout -- rigid trailing controls cluster pinned right in the titlebar's hand-rolled drag flex (see titlebar disable above) */}
        <div onPointerDown={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-2xs">
          <ControlSizeProvider size="sm">
            <IconButton
              icon={geo.pinned ? MdPushPin : MdOutlinePushPin}
              label={
                geo.pinned
                  ? `Unpin (${formatShortcutLabel(TOGGLE_PIN_SHORTCUT)})`
                  : `Keep on top (${formatShortcutLabel(TOGGLE_PIN_SHORTCUT)})`
              }
              // Pinned reads as "active" via the accent tint, matching the menu check.
              className={geo.pinned ? "text-primary" : undefined}
              onClick={onTogglePin}
            />
            <IconButton
              icon={MdRemove}
              label={`Minimize (${formatShortcutLabel("mod+m")})`}
              onClick={toggleMinimize}
            />
            <IconButton
              icon={geo.snap === "maximize" ? MdFilterNone : MdCropSquare}
              label={geo.snap === "maximize" ? "Restore" : "Maximize"}
              onClick={toggleMaximize}
            />
            <IconButton
              icon={MdClose}
              // Closes the whole window; the chip × closes a single member.
              label="Close window"
              onClick={onCloseWindow}
            />
          </ControlSizeProvider>
        </div>
      </div>

      {/* Resize handles only in the normal state — a min/snapped window has no
          free border to drag. */}
      {!geo.minimized && !geo.snap && (
        <WindowResizeHandles setGeo={setGeo} windowId={win.id} />
      )}

      {/* Modal keyboard move/size affordance: a full-window cursor layer (a click
          drops the window where it is) plus a centred keyboard hint. */}
      {interaction.mode && (
        <div
          // eslint-disable-next-line layout/no-adhoc-layout -- full-window cursor layer for the modal keyboard move/size affordance; bare absolute layer with style-driven cursor, window chrome
          className="absolute inset-0 z-raised"
          style={{
            cursor: interaction.mode === "move" ? "move" : "nwse-resize",
          }}
        >
          <Surface
            level="overlay"
            // eslint-disable-next-line layout/no-adhoc-layout -- top-center keyboard hint inside the modal interaction layer; off-ramp top-3 offset, decorative window chrome
            className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 px-sm py-2xs"
          >
            <Text variant="caption" as="span">
              {interaction.mode === "move"
                ? "Arrow keys move · Enter places · Esc cancels"
                : "Arrow keys resize · Enter applies · Esc cancels"}
            </Text>
          </Surface>
        </div>
      )}

      <WindowSystemMenu
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        geo={geo}
        onRestore={restore}
        onMove={() => interaction.begin("move")}
        onSize={() => interaction.begin("size")}
        onMinimize={toggleMinimize}
        onMaximize={toggleMaximize}
        onTogglePin={onTogglePin}
        onCloseWindow={onCloseWindow}
        mergeTargets={mergeTargets}
        onMergeInto={onMergeInto}
        canSplit={canSplit}
        onSplit={onSplit}
        desktops={desktops}
        currentDesktopId={currentDesktopId}
        onMoveToDesktop={onMoveToDesktop}
        onMoveToNewDesktop={onMoveToNewDesktop}
      />
    </>
  );
}
