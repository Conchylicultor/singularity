import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { scrollToBottom } from "./scroll-to-bottom";

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
  /** True when the viewport is within `threshold` of the bottom. */
  isPinned: boolean;
  /** True when content has grown while unpinned. Cleared on jump or re-pin. */
  hasUnread: boolean;
  /** Smooth-scroll to the bottom. Re-pins on completion. */
  jumpToBottom: () => void;
  /** If pinned, scroll to bottom after paint. If unpinned, set hasUnread. */
  scrollIfPinned: () => void;
}

const DEFAULT_THRESHOLD = 50;

export function useStickyScroll(
  opts: UseStickyScrollOptions = {},
): StickyScrollHandle {
  const { threshold = DEFAULT_THRESHOLD, forceScrollKey, resetKey } = opts;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);
  const isPinnedRef = useRef(true);

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
      el.style.overflowAnchor = pinned ? "none" : "auto";
      setIsPinned(pinned);
      if (pinned) setHasUnread(false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [threshold]);

  const scrollIfPinned = useCallback(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    if (isPinnedRef.current) {
      requestAnimationFrame(() => {
        viewport.scrollTop = viewport.scrollHeight;
      });
    } else {
      setHasUnread(true);
    }
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    scrollToBottom(el, { behavior: "smooth" });
    setHasUnread(false);
  }, []);

  return { scrollRef, isPinned, hasUnread, jumpToBottom, scrollIfPinned };
}
