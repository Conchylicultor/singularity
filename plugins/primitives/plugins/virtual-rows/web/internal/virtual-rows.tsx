import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export interface VirtualRowsProps<T> {
  items: readonly T[];
  /** Estimated px per row; dynamic measurement refines it after mount. */
  estimateSize: number;
  /** Rows rendered beyond the viewport on each side. Default 8. */
  overscan?: number;
  getKey: (item: T, index: number) => string;
  /** Applied to each absolute-positioned row wrapper (e.g. horizontal inset). */
  itemClassName?: string;
  /** When set, scrolls the virtualizer to this index (align: auto — only when off-screen). For host-driven selection reveal. */
  scrollToIndex?: number | null;
  /**
   * Item keys that must stay rendered even when scrolled out of the window.
   * They render at their true measured offset (so they're invisible off-screen
   * but remain in the DOM). The use case is an in-progress @dnd-kit drag whose
   * source row would otherwise unmount mid-gesture — unregistering its
   * draggable and cancelling the drop. Keep it pinned for the drag's duration.
   */
  keepMounted?: readonly string[];
  children: (item: T, index: number) => ReactNode;
}

const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

/**
 * Walk up from `el` to the nearest ancestor that actually scrolls vertically.
 * Mode-agnostic: in a surface-mode data-view the data-view's own bounded body
 * is the match; embedded inside another scroller (a tabbed-view tab, a detail
 * pane) the *outer* scroller is the match — so windowing works wherever the
 * data-view is mounted, instead of assuming the data-view owns the scroll.
 * Falls back to the document scroller so a list is never left un-windowed.
 */
function findScrollParent(el: HTMLElement | null): HTMLElement {
  let node = el?.parentElement ?? null;
  while (node) {
    if (SCROLLABLE_OVERFLOW.has(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return document.scrollingElement as HTMLElement;
}

/**
 * Windowed renderer shared by data-view's flat views. Renders only the rows
 * intersecting the host's scroll viewport (+overscan) inside a full-height
 * sizer, so a large data source stays cheap to render and scroll. Rows are
 * dynamically measured (variable heights supported).
 *
 * The scroll element is discovered at runtime (`findScrollParent`) rather than
 * threaded in, so the same component windows correctly whether the data-view
 * owns its scroll (surface mode) or is embedded inside a larger scroller. When
 * the list does not start at the top of that scroller (a toolbar / tab strip
 * sits above it), `scrollMargin` offsets the windowing by the measured gap.
 */
export function VirtualRows<T>({
  items,
  estimateSize,
  overscan = 8,
  getKey,
  itemClassName,
  scrollToIndex,
  keepMounted,
  children,
}: VirtualRowsProps<T>): ReactNode {
  const sizerRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Indexes of the pinned (keepMounted) items. Empty (cheap early-out) whenever
  // nothing is pinned, which is the common, non-dragging case.
  const pinnedIndexes = useMemo(() => {
    if (!keepMounted || keepMounted.length === 0) return [];
    const want = new Set(keepMounted);
    const out: number[] = [];
    items.forEach((item, i) => {
      if (want.has(getKey(item, i))) out.push(i);
    });
    return out;
  }, [keepMounted, items, getKey]);

  // Force the pinned indexes into the rendered range on top of the windowed
  // range, so a pinned row stays mounted (at its real offset) even far outside
  // the viewport.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const base = defaultRangeExtractor(range);
      if (pinnedIndexes.length === 0) return base;
      const set = new Set(base);
      for (const i of pinnedIndexes) {
        if (i >= 0 && i < items.length) set.add(i);
      }
      return [...set].sort((a, b) => a - b);
    },
    [pinnedIndexes, items.length],
  );

  // Resolve the scroll container and the list's offset within it once mounted
  // (refs are attached by layout-effect time). A layout effect runs before
  // paint, so the windowed rows appear without a blank frame.
  useLayoutEffect(() => {
    const sizer = sizerRef.current;
    if (!sizer) return;
    const parent = findScrollParent(sizer);
    setScrollEl(parent);
    setScrollMargin(
      sizer.getBoundingClientRect().top -
        parent.getBoundingClientRect().top +
        parent.scrollTop,
    );
  }, []);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => getKey(items[index]!, index),
    rangeExtractor,
    scrollMargin,
  });

  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0) return;
    virtualizer.scrollToIndex(scrollToIndex, { align: "auto" });
  }, [scrollToIndex, virtualizer]);

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- the windowing sizer: a relative positioning host whose height is the full virtual extent, anchoring each row at a measured translateY offset; no positioning primitive models a windowed list
    <div
      ref={sizerRef}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((vi) => (
        <div
          key={vi.key}
          data-index={vi.index}
          ref={virtualizer.measureElement}
          // eslint-disable-next-line layout/no-adhoc-layout -- each windowed row is absolutely positioned at its computed translateY (set via style below); dynamic offset positioning no Pin/Overlay primitive expresses
          className={cn("absolute left-0 right-0 top-0", itemClassName)}
          style={{
            transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {children(items[vi.index]!, vi.index)}
        </div>
      ))}
    </div>
  );
}
