import { createContext } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";
import type { ScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";
import type { ViewerImage } from "./types";

/** One image in a gallery: what to show, and the on-page element it opens
 *  from (the open/close animation's anchor, and where focus returns). */
export interface GalleryMember {
  readonly image: ViewerImage;
  readonly element: Element;
}

export interface GalleryState {
  readonly members: ReadonlyMap<string, GalleryMember>;
  /** Member keys in page order — the order ← / → walks. */
  readonly order: readonly string[];
  /** The member on screen, by key — never by index, so images appearing or
   *  disappearing around it (a transcript streaming in) cannot change which
   *  image is open. `null` = the viewer is closed. */
  readonly openKey: string | null;
}

export const GalleryStore = defineScopedStore<GalleryState>(() => ({
  members: new Map(),
  order: [],
  openKey: null,
}));

/** The enclosing gallery's store, or `null` outside any `<ImageGallery>` —
 *  where a `ViewerThumbnail` becomes a gallery of one, and the trigger hook
 *  throws. A separate context from the store's own because the store's hooks
 *  throw outside their Provider, and "no gallery here" is an answer the
 *  thumbnail acts on. */
export const GalleryContext = createContext<ScopedStore<GalleryState> | null>(
  null,
);

/** Does `a` come before `b` in the document? */
function precedes(a: Element, b: Element): boolean {
  return (
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  );
}

/**
 * `order` with `key` inserted at its page position. A binary search over the
 * members' elements, so N thumbnails mounting cost O(N log N) comparisons, not
 * a full re-sort each.
 */
export function insertInPageOrder(
  order: readonly string[],
  key: string,
  elementOf: (key: string) => Element,
): string[] {
  const el = elementOf(key);
  let lo = 0;
  let hi = order.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (precedes(el, elementOf(order[mid]!))) hi = mid;
    else lo = mid + 1;
  }
  return [...order.slice(0, lo), key, ...order.slice(lo)];
}

/** Join the gallery (or update this member in place). Returns the leave. */
export function joinGallery(
  store: ScopedStore<GalleryState>,
  key: string,
  member: GalleryMember,
): () => void {
  store.setState((s) => {
    const members = new Map(s.members).set(key, member);
    const rest = s.order.filter((k) => k !== key);
    const elementOf = (k: string) => members.get(k)!.element;
    return { ...s, members, order: insertInPageOrder(rest, key, elementOf) };
  });
  return () =>
    store.setState((s) => {
      if (!s.members.has(key)) return s;
      const members = new Map(s.members);
      members.delete(key);
      return { ...s, members, order: s.order.filter((k) => k !== key) };
    });
}

export function openInGallery(
  store: ScopedStore<GalleryState>,
  key: string,
): void {
  store.setState((s) => ({ ...s, openKey: key }));
}
