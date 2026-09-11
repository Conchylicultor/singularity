import type { ReactNode } from "react";
import { GalleryContext, GalleryStore } from "../internal/gallery-store";
import { ImageViewer } from "./image-viewer";

/**
 * A set of images the viewer steps through with ← / →. Every
 * `ViewerThumbnail` (or `useImageViewerTrigger` element) rendered inside joins
 * it, in the order they appear on the page, and leaves when it unmounts.
 * Renders the viewer while one of them is open.
 *
 * Wrap the content whose images belong together — a conversation transcript —
 * and nothing else: a composer's not-yet-sent attachments stay out. Two
 * galleries never share state, so two panes on one conversation step
 * independently.
 */
export function ImageGallery({ children }: { children: ReactNode }) {
  return (
    <GalleryStore.Provider>
      <GalleryScope>{children}</GalleryScope>
    </GalleryStore.Provider>
  );
}

function GalleryScope({ children }: { children: ReactNode }) {
  const store = GalleryStore.useStoreApi();
  return (
    <GalleryContext value={store}>
      {children}
      <GalleryViewer />
    </GalleryContext>
  );
}

function GalleryViewer() {
  const store = GalleryStore.useStoreApi();
  const { members, order, openKey } = GalleryStore.useStore();
  const index = openKey === null ? -1 : order.indexOf(openKey);
  // Closed — or the open image's thumbnail has gone from the page, taking
  // the image with it.
  if (index < 0) return null;
  return (
    <ImageViewer
      images={order.map((key) => members.get(key)!.image)}
      index={index}
      onIndexChange={(i) =>
        store.setState((s) => ({ ...s, openKey: s.order[i] ?? s.openKey }))
      }
      onClose={() => store.setState((s) => ({ ...s, openKey: null }))}
      originOf={(i) => members.get(order[i] ?? "")?.element ?? null}
    />
  );
}
