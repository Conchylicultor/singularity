/**
 * Carrying a reader's place from one document to the next — a same-origin
 * iframe whose `src` changed and whose new document replaces the old one (the
 * prototype canvas's live frames reload this way on every edit).
 *
 * `captureDocumentScroll` reads every scroll offset of the outgoing document;
 * `restoreDocumentScroll` re-applies them to the incoming one, matched by
 * element (id, else DOM path).
 *
 * A client-rendered document may not yet have the element, or the height, to
 * scroll to when it fires `load`. So the restore keeps re-trying as the
 * document grows — on every DOM mutation and every sub-resource load — until
 * each offset is reached, the reader takes over (wheel, touch, key, pointer),
 * or {@link RESTORE_DEADLINE_MS} has passed. Never a polling loop: each retry
 * is caused by the document changing.
 */

/** What {@link captureDocumentScroll} read: every scrolled element and its offset. */
export type DocumentScroll = readonly ScrollPlace[];

/** One scrolled element: where it is, and how far it was scrolled. */
interface ScrollPlace {
  /** How to find the element in the next document. */
  locator: Locator;
  top: number;
  left: number;
}

/**
 * - `root`: the document's scrolling element (the page itself).
 * - `id`: an element with this id — survives an edit that moves it.
 * - `path`: child indices from `<html>` — the best guess for an anonymous one.
 */
type Locator =
  | { kind: "root" }
  | { kind: "id"; id: string }
  | { kind: "path"; path: number[] };

/** How long a new document is given to grow into the offsets it is restored to. */
const RESTORE_DEADLINE_MS = 5_000;

/** The reader's own scrolling hands the place back to them. */
const READER_INPUTS = ["wheel", "touchstart", "keydown", "pointerdown"];

/** Every scroll offset in `doc` that is not at the origin. */
export function captureDocumentScroll(doc: Document): DocumentScroll {
  const places: ScrollPlace[] = [];
  const root = doc.scrollingElement;
  if (root && (root.scrollTop !== 0 || root.scrollLeft !== 0)) {
    places.push({
      locator: { kind: "root" },
      top: root.scrollTop,
      left: root.scrollLeft,
    });
  }
  for (const el of doc.querySelectorAll("body *")) {
    if (el.scrollTop === 0 && el.scrollLeft === 0) continue;
    places.push({
      locator: locatorOf(el),
      top: el.scrollTop,
      left: el.scrollLeft,
    });
  }
  return places;
}

/**
 * Scroll `doc` to `places`, retrying as it grows (see the module doc). Returns
 * the cancel — call it when this document is replaced or unmounted.
 */
export function restoreDocumentScroll(
  doc: Document,
  places: DocumentScroll,
): () => void {
  let pending: readonly ScrollPlace[] = places;
  const win = doc.defaultView;
  if (pending.length === 0 || !win) return noop;

  const apply = (): void => {
    pending = pending.filter((place) => !scrollTo(doc, place));
    if (pending.length === 0) stop();
  };

  const observer = new win.MutationObserver(apply);
  // An image or font finishing can grow the page without a DOM mutation.
  const onResourceLoad = (): void => apply();
  const deadline = win.setTimeout(() => stop(), RESTORE_DEADLINE_MS);
  let stopped = false;
  function stop(): void {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    doc.removeEventListener("load", onResourceLoad, true);
    for (const type of READER_INPUTS) {
      doc.removeEventListener(type, stop, true);
    }
    win?.clearTimeout(deadline);
  }

  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  doc.addEventListener("load", onResourceLoad, true);
  for (const type of READER_INPUTS) {
    doc.addEventListener(type, stop, { capture: true, passive: true });
  }
  apply();
  return stop;
}

/** Scroll one place; `true` once it sits at its offset. */
function scrollTo(doc: Document, place: ScrollPlace): boolean {
  const el = resolve(doc, place.locator);
  if (!el) return false;
  el.scrollTop = place.top;
  el.scrollLeft = place.left;
  return (
    Math.abs(el.scrollTop - place.top) <= 1 &&
    Math.abs(el.scrollLeft - place.left) <= 1
  );
}

function locatorOf(el: Element): Locator {
  if (el.id !== "") return { kind: "id", id: el.id };
  const path: number[] = [];
  let node: Element = el;
  while (node.parentElement) {
    path.unshift(
      Array.prototype.indexOf.call(node.parentElement.children, node),
    );
    node = node.parentElement;
  }
  return { kind: "path", path };
}

function resolve(doc: Document, locator: Locator): Element | null {
  switch (locator.kind) {
    case "root":
      return doc.scrollingElement;
    case "id":
      return doc.getElementById(locator.id);
    case "path": {
      let node: Element | undefined = doc.documentElement;
      for (const i of locator.path) node = node?.children[i];
      return node ?? null;
    }
  }
}

function noop(): void {}
