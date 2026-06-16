import type { ReactNode } from "react";

/**
 * The cover region of the default card. One of three kinds, each given a
 * uniform `aspect-video` frame so cards stay the same height across kinds:
 *
 * - `image` — a URL painted as `object-cover` (the classic media cover).
 * - `icon`  — a rendered icon node centered in a tinted block (app-launcher /
 *   record-without-artwork style). Pass an already-sized icon element.
 * - `node`  — an arbitrary preview node (e.g. a Story lens render or a theme
 *   swatch strip), clipped to the cover frame.
 *
 * Return `null` for no cover region.
 */
export type CoverContent =
  | { kind: "image"; src: string }
  | { kind: "icon"; icon: ReactNode }
  | { kind: "node"; node: ReactNode };

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
  /**
   * Produce the cover region for the default card from a row. This is the
   * sanctioned way to get an icon- or preview-covered card WITHOUT a custom
   * `renderCard` — the body (title + property rows) still comes from the
   * `FieldDef` schema. Takes precedence over `coverField`. Return `null` for
   * no cover.
   */
  cover?: (row: TRow) => CoverContent | null;
  /** Override which field is the image cover (else the FieldDef with `cover: true`). */
  coverField?: string;
  /** Grid sizing: the min card width in px. Default 200. */
  minCardWidth?: number;
  /**
   * When `true` AND exactly ONE creator is present on `DataViewProps.creators`,
   * the gallery renders a trailing dashed "+" card (after the row map) firing
   * that creator's `onSelect`. With zero or multiple creators the card is
   * omitted — a single dashed card can't express an N-way choice, so multi-
   * creator surfaces rely on the toolbar menu instead.
   */
  showCreateCard?: boolean;
}
