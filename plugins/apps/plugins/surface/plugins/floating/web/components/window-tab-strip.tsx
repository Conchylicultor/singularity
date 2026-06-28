import {
  useCallback,
  useRef,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MdAdd, MdWebAsset } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  cn,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Tab } from "@plugins/ui/plugins/tab-bar/web";
import {
  endTabDrag,
  startTabDrag,
  updateTabDrag,
  useTabDragSession,
  type TabDragDrop,
} from "../hooks/use-tab-drag";

/** One member's display data for a tab-strip chip. */
export interface WindowMember {
  tabId: string;
  title: string;
  icon: ComponentType<{ className?: string }> | undefined;
}

/** The commit operations a finished chip drag invokes (resolved by the host). */
export interface TabDragCommit {
  /** Reorder a member within this same window's strip. */
  reorder: (tabId: string, index: number) => void;
  /** Merge a member into another window's strip at an index. */
  merge: (tabId: string, targetWindowId: string, index: number) => void;
  /** Tear a member off into a new window at a desktop-relative point. */
  split: (tabId: string, point: { x: number; y: number }) => void;
}

interface WindowTabStripProps {
  /** The window this strip belongs to (source of a drag started from it). */
  windowId: string;
  members: WindowMember[];
  activeTabId: string;
  /** Show + focus a member (click on its chip). */
  onSelect: (tabId: string) => void;
  /** Close a single member (the chip ×). */
  onCloseMember: (tabId: string) => void;
  /** Open a fresh tab as a new member of this window (the trailing `+`). */
  onNewTab: () => void;
  /** Commit ops for a finished chip drag (reorder / merge / split). */
  commit: TabDragCommit;
}

/** Swallow the pointer so a chip interaction never starts a window move-drag. */
function stop(e: ReactPointerEvent) {
  e.stopPropagation();
}

/** Movement (px) past which a chip pointer-down promotes from a click to a drag. */
const DRAG_THRESHOLD = 5;

/**
 * Resolve where the pointer currently sits for a tab-chip drag: over a window's
 * tab-strip drop-zone (`data-floating-window-id`) with the computed insertion
 * index among that strip's chips, or `desktop` (empty backdrop). The insertion
 * index counts every chip whose horizontal midpoint is left of the cursor —
 * including the dragged chip's own slot, so an unmoved same-strip drop resolves
 * back to its current index (a no-op the store guards).
 */
function resolveDrop(x: number, y: number): TabDragDrop {
  const el = document.elementFromPoint(x, y);
  const strip = el?.closest<HTMLElement>("[data-floating-window-id]");
  if (!strip) return { kind: "desktop" };
  const windowId = strip.dataset.floatingWindowId!;
  const chips = strip.querySelectorAll<HTMLElement>("[data-floating-tab-id]");
  let index = 0;
  for (const chip of chips) {
    const r = chip.getBoundingClientRect();
    if (x > r.left + r.width / 2) index += 1;
  }
  return { kind: "strip", windowId, index };
}

/**
 * The in-window tab strip rendered inside {@link WindowChrome}'s titlebar: one
 * chip per member (app icon + truncated title + close ×). A single-member window
 * shows exactly one chip — visually clean, like a browser with one tab. The
 * active member's look is owned by the active tab-bar theme variant (default
 * `chip` = accent-filled pill); inactive members dim.
 *
 * Clicking a chip shows + focuses that member; the chip × closes that member
 * alone (the right-side titlebar control closes the whole window). Every chip
 * stops the pointer on pointer-down so it never starts the titlebar move-drag
 * underneath; the close × stops the pointer internally (handled by the
 * primitive's {@link TabCloseButton}).
 *
 * A chip body is also **draggable** (browser-style): pressing and moving past a
 * small threshold starts a cross-window drag (mirroring the titlebar move-drag
 * idiom — window listeners cleaned up on up/cancel) that reorders within this
 * strip, merges onto another window's strip, or tears the tab off onto the empty
 * desktop. Hit-testing + insertion-index live in {@link resolveDrop}; the live
 * ghost + indicator are painted by the desktop-level {@link TabDragOverlay}. A
 * plain click (no threshold crossed) still selects, so Phase 1's click-to-
 * activate is preserved.
 *
 * Chips compose the themable {@link Tab} primitive, which renders the active
 * tab-bar variant (icon + label + trailing close ×) and owns active/collapsed
 * styling — the strip no longer paints its own chip shell or close button.
 */
export function WindowTabStrip({
  windowId,
  members,
  activeTabId,
  onSelect,
  onCloseMember,
  onNewTab,
  commit,
}: WindowTabStripProps) {
  const session = useTabDragSession();
  // Set true on a completed drag so the trailing synthetic click (fired by the
  // browser after pointerup) doesn't also `onSelect` the moved tab.
  const draggedRef = useRef(false);

  // Begin tracking a potential chip drag. A click still selects: we only commit
  // to a drag once the pointer moves past DRAG_THRESHOLD, and we suppress the
  // trailing click in that case. Window listeners (not pointer capture) so the
  // drag keeps tracking even when the cursor leaves the chip — mirroring the
  // titlebar move-drag in window-chrome.tsx.
  const onChipPointerDown = useCallback(
    (e: ReactPointerEvent, member: WindowMember) => {
      // Keep Phase 1's invariant: a chip never starts the window move-drag.
      e.stopPropagation();
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;

      const onMove = (ev: PointerEvent) => {
        if (!dragging) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD)
            return;
          dragging = true;
          startTabDrag({
            tabId: member.tabId,
            sourceWindowId: windowId,
            pointer: { x: ev.clientX, y: ev.clientY },
            label: member.title,
            icon: member.icon,
            drop: resolveDrop(ev.clientX, ev.clientY),
          });
          return;
        }
        updateTabDrag({
          pointer: { x: ev.clientX, y: ev.clientY },
          drop: resolveDrop(ev.clientX, ev.clientY),
        });
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        if (!dragging) return; // a plain click — let the chip's onActivate select.
        draggedRef.current = true; // swallow the trailing synthetic click.
        const drop = resolveDrop(ev.clientX, ev.clientY);
        endTabDrag();
        if (drop.kind === "desktop") {
          // Desktop-relative point: the strip → tab container → backdrop chain
          // (mirrors window-chrome.tsx). Walk up from any window strip element to
          // the shared backdrop and subtract its rect so the new window lands
          // under the cursor.
          const anyStrip =
            document.querySelector<HTMLElement>("[data-floating-window-id]");
          const backdrop = anyStrip?.parentElement?.parentElement ?? null;
          const rect = backdrop?.getBoundingClientRect();
          const point = rect
            ? { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
            : { x: ev.clientX, y: ev.clientY };
          commit.split(member.tabId, point);
        } else if (drop.windowId === windowId) {
          commit.reorder(member.tabId, drop.index);
        } else {
          commit.merge(member.tabId, drop.windowId, drop.index);
        }
      };

      const onCancel = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        endTabDrag();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [windowId, commit],
  );

  return (
    <Stack direction="row" gap="2xs" align="center">
      {members.map((member) => {
        const active = member.tabId === activeTabId;
        const Icon = member.icon ?? MdWebAsset;
        // The dragged chip placeholders in its source strip while the drag is live.
        const dragged =
          session?.tabId === member.tabId &&
          session.sourceWindowId === windowId;
        return (
          // The dragged-opacity, data attr, pointer-down, and title all pass
          // straight through to the variant root: `Tab`'s `className` merges into
          // the variant chip styling (not replaces it), and `resolveDrop`'s
          // hit-test + insertion-index read the real chip rect via the data attr.
          <Tab
            key={member.tabId}
            data-floating-tab-id={member.tabId}
            icon={Icon}
            label={member.title}
            active={active}
            title={member.title}
            className={cn(dragged && "opacity-40")}
            onPointerDown={(e: ReactPointerEvent) =>
              onChipPointerDown(e, member)
            }
            onActivate={() => {
              if (draggedRef.current) {
                draggedRef.current = false;
                return;
              }
              onSelect(member.tabId);
            }}
            onClose={() => onCloseMember(member.tabId)}
          />
        );
      })}
      {/* Trailing new-tab affordance (browser `+`): opens a fresh tab as a new
          member of this window. Stops the pointer on pointer-down so the click
          never starts the titlebar move-drag underneath, mirroring the chips. */}
      <ControlSizeProvider size="sm">
        <IconButton
          icon={MdAdd}
          label="New tab"
          onPointerDown={stop}
          onClick={onNewTab}
        />
      </ControlSizeProvider>
    </Stack>
  );
}
