import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface UseStickyScrollOptions {
  /** Distance from bottom (px) within which the view is considered "pinned". */
  threshold?: number;
  /**
   * Changing this value force-scrolls to the bottom regardless of pin state.
   * Use for "user just acted" signals (e.g. turn sent) so the user sees the
   * effect even if they were scrolled up.
   */
  forceScrollKey?: number | string | boolean;
  /**
   * Changing this value treats the content as a fresh stream: scroll to bottom
   * before paint and clear unread. Use for "different conversation" / channel.
   */
  resetKey?: string | number;
}

export interface StickyScrollHandle {
  /** Attach to the scrolling viewport (`overflow: auto`). */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the inner content wrapper. ResizeObserver watches this. */
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** True when the viewport is within `threshold` of the bottom. */
  isPinned: boolean;
  /** True when content has grown while unpinned. Cleared on jump or re-pin. */
  hasUnread: boolean;
  /** Smooth-scroll to the bottom. Re-pins on completion. */
  jumpToBottom: () => void;
}

const DEFAULT_THRESHOLD = 50;

export function useStickyScroll(
  opts: UseStickyScrollOptions = {},
): StickyScrollHandle {
  const { threshold = DEFAULT_THRESHOLD, forceScrollKey, resetKey } = opts;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);
  const isPinnedRef = useRef(true);

  // overflowAnchor is managed dynamically in the scroll handler below:
  // "none" when pinned (so ResizeObserver can force-scroll to bottom unimpeded),
  // "auto" when unpinned (so the browser anchors the user's visual position when
  // content above them grows — e.g. a ConvChip loads and expands).

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    el.style.overflowAnchor = "none";
    setIsPinned(true);
    setHasUnread(false);
    isPinnedRef.current = true;
  }, [resetKey]);

  const forceScrollFirstRunRef = useRef(true);
  useEffect(() => {
    if (forceScrollFirstRunRef.current) {
      forceScrollFirstRunRef.current = false;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setHasUnread(false);
  }, [forceScrollKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const pinned = distance < threshold;
      isPinnedRef.current = pinned;
      // When pinned: disable browser anchor so ResizeObserver can force-scroll to bottom.
      // When unpinned: enable browser anchor so content expanding above doesn't jump the view up.
      el.style.overflowAnchor = pinned ? "none" : "auto";
      setIsPinned(pinned);
      if (pinned) setHasUnread(false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [threshold]);

  useEffect(() => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    let frame: number | null = null;
    const scrollToBottom = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        viewport.scrollTop = viewport.scrollHeight;
      });
    };

    let lastHeight = content.getBoundingClientRect().height;
    const contentObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const newHeight = entry.contentRect.height;
      if (newHeight <= lastHeight) {
        lastHeight = newHeight;
        return;
      }
      lastHeight = newHeight;
      if (isPinnedRef.current) {
        scrollToBottom();
      } else {
        setHasUnread(true);
      }
    });
    contentObserver.observe(content);

    let lastWidth = viewport.clientWidth;
    const viewportObserver = new ResizeObserver(() => {
      const newWidth = viewport.clientWidth;
      if (newWidth === lastWidth) return;
      lastWidth = newWidth;
      if (isPinnedRef.current) {
        scrollToBottom();
      }
    });
    viewportObserver.observe(viewport);

    return () => {
      contentObserver.disconnect();
      viewportObserver.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setHasUnread(false);
  }, []);

  return { scrollRef, contentRef, isPinned, hasUnread, jumpToBottom };
}
