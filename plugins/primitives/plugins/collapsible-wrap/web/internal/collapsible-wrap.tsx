import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MdExpandLess, MdExpandMore } from "react-icons/md";
import {
  useEditMode,
  ReorderLayoutContext,
  type ReorderLayout,
} from "@plugins/reorder/web";
import { rectSortingStrategy } from "@plugins/primitives/plugins/sortable-list/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { cn } from "@/lib/utils";

export interface CollapsibleWrapProps {
  /** The single <Slot.Render> element — never indexed or duplicated. */
  children: ReactNode;
  /** Visible rows when collapsed; default 1. */
  rows?: number;
  /** Gap between chips in pixels; default 4 (= gap-1). */
  gap?: number;
  className?: string;
}

/** Popover panel inset (px) around the spilled rows in the expanded state. */
const PANEL_PAD = 6;

/** Collect effective flex children, walking through `display:contents`. */
function effectiveChildren(parent: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const ch of Array.from(parent.children) as HTMLElement[]) {
    if (getComputedStyle(ch).display === "contents") {
      out.push(...effectiveChildren(ch));
    } else {
      out.push(ch);
    }
  }
  return out;
}

/**
 * Uniform row height = the tallest effective child across ALL rows. Using a
 * global max (rather than only the first row) keeps the collapse clamp stable
 * when a taller chip wraps to row 2 — otherwise the clamp would shrink/grow as
 * the tallest chip moves between rows, producing a few-px vertical shift at the
 * collapse boundary. Walks through `display:contents` reorder wrappers so a
 * zero-height wrapper never collapses the clamp to 0, and filters dnd-kit's
 * zero-area / off-screen measuring artifacts (offsetHeight <= 1, offsetWidth 0).
 */
function uniformRowHeight(wrap: HTMLElement): number {
  const children = effectiveChildren(wrap).filter(
    (c) => c.offsetHeight > 1 && c.offsetWidth > 0,
  );
  if (children.length === 0) return 0;
  let h = 0;
  for (const c of children) h = Math.max(h, c.offsetHeight);
  return h;
}

export function CollapsibleWrap({
  children,
  rows = 1,
  gap = 4,
  className,
}: CollapsibleWrapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const [overflowing, setOverflowing] = useState(false);
  const [clampHeight, setClampHeight] = useState<number | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [userExpanded, setUserExpanded] = useState(false);

  const editMode = useEditMode();
  const expanded = userExpanded || editMode;

  // Inject the 2-D wrap strategy into the reorder middleware: rectSortingStrategy
  // makes cross-row drag work once chips spill onto multiple rows. Stable
  // identity so the middleware's context consumer doesn't churn. The spacer is
  // unchanged from the 1-D case — a `flex-1` push element behaves identically
  // under wrap (it grows to fill its line, pushing chips right until they wrap).
  const wrapLayout = useMemo<ReorderLayout>(
    () => ({ strategy: rectSortingStrategy }),
    [],
  );

  // --- Overflow + clamp-height detection ------------------------------------
  // Mirror responsive-overflow: ResizeObserver on the wrap box, deferred via
  // requestAnimationFrame. No timers/polling. We track both the 1-row clamp
  // height (the box's fixed layout height in BOTH states) and the full content
  // height (used to size the expanded popover backdrop).
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const recompute = () => {
      // The reorder middleware wraps each contribution; in view mode those
      // wrappers are `display:contents` (offsetHeight 0). Walk through them to
      // the real boxes and take a uniform (global-max) row height.
      const rowHeight = uniformRowHeight(wrap);
      if (rowHeight === 0) {
        setOverflowing(false);
        setClampHeight(null);
        setContentHeight(0);
        return;
      }
      const clamp = rowHeight * rows + gap * (rows - 1);
      setClampHeight(clamp);
      setContentHeight(wrap.scrollHeight);
      setOverflowing(wrap.scrollHeight > clamp + 1);
    };

    let rafId: number | null = null;
    const schedule = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(recompute);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(wrap);
    recompute();

    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [rows, gap, expanded]);

  const collapse = useCallback(() => setUserExpanded(false), []);
  const expand = useCallback(() => setUserExpanded(true), []);

  // --- Layout: in-flow in both states, row 1 never moves --------------------
  // The box's LAYOUT height is `clampHeight` (one row) in BOTH collapsed and
  // expanded — only `overflow` flips. Because the layout height is identical,
  // the host band's `items-center` centers exactly one row the same way in both
  // states, so row 1 is pixel-stable. Collapsed clips the extra rows; expanded
  // reveals them — they spill DOWN over the content below (the host must opt the
  // PaneChrome band into `overflow-visible` via `headerSpill`). A maxHeight-
  // clamped box's own background can't paint overflowing content, so a measured
  // absolute backdrop draws the popover panel behind the spilled rows.
  const style: CSSProperties =
    clampHeight === null
      ? { gap }
      : {
          gap,
          maxHeight: clampHeight,
          overflow: expanded ? "visible" : "hidden",
        };

  const showBackdrop = expanded && overflowing && clampHeight !== null;

  // Outer = positioning context (holds the backdrop + the stacking lift); inner
  // (`wrapRef`) = the measured flex-wrap box holding ONLY the chips. The backdrop
  // is sized FROM the inner's measurements, so it must NOT live inside the
  // measured element — otherwise `uniformRowHeight()`/`scrollHeight` would count
  // it as content, inflating the clamp, resizing the box, re-firing the
  // ResizeObserver, and oscillating row 1 between two positions. Keeping it a
  // sibling of `wrapRef` breaks that feedback path by construction.
  const wrapBox = (
    <div className={cn("relative min-w-0 flex-1", expanded && "z-popover")}>
      {showBackdrop && (
        <div
          aria-hidden
          className="pointer-events-none absolute -z-10 rounded-md border bg-popover shadow-md"
          style={{
            top: -PANEL_PAD,
            left: -PANEL_PAD,
            right: -PANEL_PAD,
            height: contentHeight + PANEL_PAD * 2,
          }}
        />
      )}
      <div
        ref={wrapRef}
        className={cn("flex flex-wrap content-start min-w-0", className)}
        style={style}
      >
        <ReorderLayoutContext.Provider value={wrapLayout}>
          {children}
        </ReorderLayoutContext.Provider>
      </div>
    </div>
  );

  const showChevron = (overflowing || expanded) && !editMode;

  return (
    <>
      {wrapBox}
      {showChevron && (
        <IconButton
          icon={expanded ? MdExpandLess : MdExpandMore}
          label={expanded ? "Collapse" : "Expand"}
          className="shrink-0"
          onClick={expanded ? collapse : expand}
        />
      )}
    </>
  );
}
