import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MdExpandLess, MdExpandMore } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

export interface ExpandableProps {
  /** The content to clamp. */
  children: ReactNode;
  /**
   * Collapsed clamp height in px. Content rendered taller than this is clipped
   * with a fade and gains a "Show more" toggle. Default 192 (= 12rem).
   */
  collapsedHeight?: number;
  /** Notified with the next expanded state whenever the user toggles. */
  onToggle?: (expanded: boolean) => void;
  className?: string;
}

const FADE_MASK = "linear-gradient(to bottom, black 65%, transparent 100%)";

/**
 * Clamps tall content to `collapsedHeight` and reveals a Show more / Show less
 * toggle — but only when the content **actually overflows** that height.
 *
 * The decision is made by measuring the content's real rendered height with a
 * ResizeObserver (mirroring collapsible-wrap / responsive-overflow), NOT by
 * guessing from character or newline counts. That makes it correct regardless
 * of soft-wrapping, font size, viewport width, or async-loaded media: a long
 * single-paragraph prose block that wraps tall is collapsed just like one with
 * many hard line-breaks.
 *
 * The measured `contentRef` child is never height-constrained (the clamp lives
 * on its parent via `max-height` + `overflow:hidden`), so its `offsetHeight`
 * always reflects the full natural height in both collapsed and expanded
 * states — the overflow check never depends on the current state.
 */
export function Expandable({
  children,
  collapsedHeight = 192,
  onToggle,
  className,
}: ExpandableProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Overflow detection: ResizeObserver on the measured content box, deferred
  // via requestAnimationFrame. No timers, no polling. Fires again when async
  // media (images) load and grow the content.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    let rafId: number | null = null;
    const recompute = () => {
      setOverflowing(content.offsetHeight > collapsedHeight + 1);
    };
    const schedule = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(recompute);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(content);
    recompute();

    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [collapsedHeight]);

  const clamped = overflowing && !expanded;
  const clipStyle: CSSProperties = clamped
    ? {
        maxHeight: collapsedHeight,
        overflow: "hidden",
        maskImage: FADE_MASK,
        WebkitMaskImage: FADE_MASK,
      }
    : {};

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      onToggle?.(next);
      return next;
    });
  };

  return (
    <div className={className}>
      <div style={clipStyle}>
        <div ref={contentRef}>{children}</div>
      </div>
      {overflowing ? (
        <button
          type="button"
          onClick={toggle}
          // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-1 spaces the show-more toggle from the content above it
          className="text-caption mt-1 text-muted-foreground hover:text-foreground"
        >
          <Stack direction="row" gap="xs" align="center">
            {expanded ? (
              <>
                <MdExpandLess className="size-3.5" />
                Show less
              </>
            ) : (
              <>
                <MdExpandMore className="size-3.5" />
                Show more
              </>
            )}
          </Stack>
        </button>
      ) : null}
    </div>
  );
}
