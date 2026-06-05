import type { ReactNode } from "react";

/**
 * Per-view options for the gallery view, threaded through
 * `DataViewProps.viewOptions.gallery` and surfaced as the opaque
 * `DataViewRenderProps.options`.
 */
export interface GalleryViewOptions<TRow> {
  /**
   * Compose a `<DataCard>` (filling its regions) OR fully replace the card.
   * A custom card owns its own click handling — the gallery does NOT wrap it
   * in `DataCard` or wire `onRowActivate`.
   */
  renderCard?: (row: TRow) => ReactNode;
  /** Override which field is the cover (else the FieldDef with `cover: true`). */
  coverField?: string;
  /** Grid sizing: the min card width in px. Default 200. */
  minCardWidth?: number;
}

/**
 * Typed helper for consumers to build a `viewOptions` entry without the host
 * being generic over view internals: `viewOptions={{ ...galleryOptions(o) }}`.
 */
export function galleryOptions<TRow>(
  o: GalleryViewOptions<TRow>,
): ["gallery", GalleryViewOptions<TRow>] {
  return ["gallery", o];
}
