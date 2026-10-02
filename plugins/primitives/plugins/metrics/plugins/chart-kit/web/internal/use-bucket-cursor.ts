import { useState, type KeyboardEvent, type PointerEvent } from "react";

/** The hovered / focused bucket of a chart, driven by pointer and keyboard alike. */
export interface BucketCursor {
  /** The active bucket, or `null`. */
  active: number | null;
  /** Spread on the focusable chart root (the svg). */
  keyboard: {
    tabIndex: 0;
    onKeyDown: (e: KeyboardEvent<Element>) => void;
    onFocus: () => void;
    onBlur: () => void;
  };
  /** Spread on the transparent hit rect spanning the plot. */
  pointer: {
    onPointerMove: (e: PointerEvent<Element>) => void;
    onPointerLeave: () => void;
    onClick: () => void;
  };
}

/**
 * One cursor over `n` buckets `band` px wide, laid out from the left edge of
 * the hit rect the pointer handlers sit on. The pointer maps its x to a bucket;
 * the keyboard steps it (←/→, Home/End) from the newest bucket, and Enter or
 * Space picks. Focus shows the same tooltip hover does, so nothing is
 * pointer-only.
 */
export function useBucketCursor(
  n: number,
  band: number,
  onPick: ((index: number) => void) | undefined,
): BucketCursor {
  const [hover, setHover] = useState<number | null>(null);
  // A cursor left past the end by a shrinking dataset is simply off.
  const active = hover !== null && hover < n ? hover : null;

  const onKeyDown = (e: KeyboardEvent<Element>) => {
    if (n === 0) return;
    const last = n - 1;
    let next: number | null;
    switch (e.key) {
      case "ArrowLeft":
        next = active === null ? last : Math.max(0, active - 1);
        break;
      case "ArrowRight":
        next = active === null ? last : Math.min(last, active + 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "Enter":
      case " ":
        if (active === null || !onPick) return;
        e.preventDefault();
        onPick(active);
        return;
      case "Escape":
        next = null;
        break;
      default:
        return;
    }
    e.preventDefault();
    setHover(next);
  };

  return {
    active,
    keyboard: {
      tabIndex: 0,
      onKeyDown,
      onFocus: () => setHover((h) => h ?? (n > 0 ? n - 1 : null)),
      onBlur: () => setHover(null),
    },
    pointer: {
      onPointerMove: (e) => {
        if (!(band > 0)) return;
        const left = e.currentTarget.getBoundingClientRect().left;
        const i = Math.floor((e.clientX - left) / band);
        setHover(i >= 0 && i < n ? i : null);
      },
      onPointerLeave: () => setHover(null),
      onClick: () => {
        if (active !== null && onPick) onPick(active);
      },
    },
  };
}
