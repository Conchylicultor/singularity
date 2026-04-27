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

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Without this, browsers anchor to upper content as content grows below,
    // fighting the bottom-pinning behavior.
    el.style.overflowAnchor = "none";
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
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
    let lastHeight = content.getBoundingClientRect().height;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const newHeight = entry.contentRect.height;
      if (newHeight <= lastHeight) {
        lastHeight = newHeight;
        return;
      }
      lastHeight = newHeight;
      if (isPinnedRef.current) {
        viewport.scrollTop = viewport.scrollHeight;
      } else {
        setHasUnread(true);
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setHasUnread(false);
  }, []);

  return { scrollRef, contentRef, isPinned, hasUnread, jumpToBottom };
}
