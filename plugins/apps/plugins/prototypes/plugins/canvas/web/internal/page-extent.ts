/**
 * What Whole page can show of one prototype document: its full height, or
 * nothing, because the page sizes itself to its window.
 *
 * A page that sizes something from its window's height in script (a
 * `resize` handler reading `innerHeight`) has no whole-page height: the taller
 * the frame, the taller the page, without end. Whole page is then unavailable
 * for it, rather than a frame that grows forever.
 */
export type PageExtent =
  { kind: "page"; height: number } | { kind: "window-sized" };

/** The page height an extent shows — `null` for a window-sized page. */
export function pageHeightOf(
  extent: PageExtent | null | undefined,
): number | null {
  return extent?.kind === "page" ? extent.height : null;
}

/** Whether two extents say the same thing (a report that changes nothing). */
export function sameExtent(
  a: PageExtent | null | undefined,
  b: PageExtent,
): boolean {
  return a?.kind === b.kind && pageHeightOf(a) === pageHeightOf(b);
}

/**
 * The CSS custom property every prototype frame sets on its document's
 * `<html>`: the height of ONE screen, in px. With Whole page on the frame is
 * as tall as the page, so `100vh` and `innerHeight` are the page, not a
 * screen; a prototype that sizes something to the screen reads this instead
 * (see `prototypes/CLAUDE.md`), and so keeps a whole-page height.
 */
export const SCREEN_HEIGHT_VAR = "--prototype-screen-height";

/**
 * Set the document's screen height; when it changed, fire `resize` on its
 * window, so a script that sizes to the screen re-reads it even when the
 * frame itself kept its size.
 */
export function publishScreenHeight(doc: Document, height: number): void {
  const root = doc.documentElement;
  const value = `${String(height)}px`;
  if (root.style.getPropertyValue(SCREEN_HEIGHT_VAR) === value) return;
  root.style.setProperty(SCREEN_HEIGHT_VAR, value);
  doc.defaultView?.dispatchEvent(new Event("resize"));
}

/**
 * Probe a loaded document's extent in its own (hidden) frame, at one screen of
 * `screenH`.
 *
 * The page is measured at `screenH`, then its frame is doubled and its scripts
 * are given a few frames to react, then the frame is put back to `screenH` and
 * the page measured again at once — before any script can run. CSS that
 * depends on the viewport (`vh`) re-lays out synchronously, so it reads the
 * same both times; a height a script wrote from the bigger window is still
 * there, so it reads taller: the page follows its window.
 *
 * A dedicated frame, never the one on screen: the doubling would show, and the
 * frame on screen already carries whatever its scripts wrote at its own size.
 */
export async function probePageExtent(
  frame: HTMLIFrameElement,
  doc: Document,
  screenH: number,
  cancelled: () => boolean,
): Promise<PageExtent | null> {
  const root = doc.documentElement;
  frame.style.height = `${String(screenH)}px`;
  publishScreenHeight(doc, screenH);
  await settle();
  if (cancelled()) return null;
  const atScreen = root.scrollHeight;

  frame.style.height = `${String(screenH * 2)}px`;
  doc.defaultView?.dispatchEvent(new Event("resize"));
  await settle();
  if (cancelled()) return null;

  frame.style.height = `${String(screenH)}px`;
  const again = root.scrollHeight;
  return Math.abs(again - atScreen) > 1
    ? { kind: "window-sized" }
    : { kind: "page", height: Math.max(atScreen, screenH) };
}

/**
 * Give the page's scripts time to react: a resize handler runs at once, but a
 * framework re-render it schedules lands a task or two later.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}
