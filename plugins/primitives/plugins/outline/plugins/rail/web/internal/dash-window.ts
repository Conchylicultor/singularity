/** The slice of entries the rail can actually paint, and what it hides. */
export interface DashWindow {
  /** Inclusive index of the first painted dash. */
  start: number;
  /** Exclusive index past the last painted dash. */
  end: number;
  /** Entries exist before `start` — the leading dash fades to say so. */
  moreAbove: boolean;
  /** Entries exist past `end` — the trailing dash fades to say so. */
  moreBelow: boolean;
}

/**
 * Which `capacity` dashes to paint for a `count`-entry outline, centered on the
 * active one.
 *
 * A 200-turn conversation cannot show 200 dashes. Truncating the tail instead
 * would make the position indicator lie exactly when the document is long enough
 * to need it — the active dash would sit off the end of the rail — so the window
 * travels with the reader and the panel (which scrolls) stays the full index.
 */
export function dashWindow(
  count: number,
  capacity: number,
  activeIndex: number,
): DashWindow {
  if (capacity >= count) {
    return { start: 0, end: count, moreAbove: false, moreBelow: false };
  }
  const half = Math.floor(capacity / 2);
  const start = Math.min(Math.max(activeIndex - half, 0), count - capacity);
  const end = start + capacity;
  return { start, end, moreAbove: start > 0, moreBelow: end < count };
}
