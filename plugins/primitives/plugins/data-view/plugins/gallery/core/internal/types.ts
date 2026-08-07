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
   * Replace the card's BODY — never the card. The gallery always builds the
   * `<DataCard>`, so every affordance the surface declared (item actions,
   * `selectedRowId`, `onRowActivate`, the cover, the aggregate badge) is wired
   * whether the body is field-driven or custom. Only the title + property rows
   * are yours.
   */
  renderBody?: (row: TRow) => ReactNode;
  /**
   * Leading block rendered beside the body (icon / avatar / status dot), the
   * gallery twin of `ListViewOptions.leading` → `Row`'s `icon` slot. Distinct
   * from `cover`, which is a full-width region ABOVE the body.
   */
  leading?: (row: TRow) => ReactNode;
  /** Card density, mirroring the list's row density. Default `"md"`. */
  size?: "sm" | "md";
  /**
   * Produce the cover region of the card from a row. This is the sanctioned way
   * to get an icon- or preview-covered card without touching the body, which
   * still comes from the `FieldDef` schema (or `renderBody`). Takes precedence
   * over `coverField`. Return `null` for no cover.
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
