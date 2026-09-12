import { useCallback, type ReactNode } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { PageData } from "@plugins/page/plugins/editor/core";
import { PageReference } from "./slots";

/** A decoration, resolved for one reference row. */
export interface PageReferenceDecoration {
  /** Classes painting the row — see `PageReference.Decoration`'s `tint`. */
  tint: string;
  /**
   * The decoration's chip, already error-isolated, or `null` when this kind of
   * page has none. A node, not a component, so the renderer places it and
   * nothing else.
   */
  chip: ReactNode | null;
}

/**
 * The decoration for the page a reference row points at, or `null` when the
 * page is of no decorated kind — the row then renders exactly as it did before
 * this seam existed.
 *
 * `page` is the referenced page's own `data`, which every reference row already
 * holds: the kind of a page is written on it, so answering costs no read.
 */
export function usePageReferenceDecoration(
  pageId: string,
  page: PageData,
): PageReferenceDecoration | null {
  const decorations = PageReference.Decoration.useContributions();
  const match = decorations.find((d) => d.applies(page));
  if (!match) return null;
  return {
    tint: match.tint,
    chip: match.component
      ? renderIsolated(
          PageReference.Decoration,
          match as unknown as Contribution,
          { pageId },
        )
      : null,
  };
}

/**
 * The tint half alone, as a function over page data — for a surface that paints
 * MANY references and never a chip (the Pages sidebar tree). One hook at the
 * top of the surface instead of one per row, and a row of no decorated kind
 * gets `undefined`, so the surface can skip painting a layer at all.
 */
export function usePageReferenceTint(): (page: PageData) => string | undefined {
  const decorations = PageReference.Decoration.useContributions();
  return useCallback(
    (page: PageData) => decorations.find((d) => d.applies(page))?.tint,
    [decorations],
  );
}
