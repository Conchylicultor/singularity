import { createContext, useContext, type ReactNode } from "react";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import type { DataViewPagePlaceholder } from "../../core";
import { PAGE_PLACEHOLDER_ATTR } from "../internal/use-visible-row-keys";

/**
 * How tall a placeholder is drawn, in px — the room its rows took when they
 * were released (`usePlaceholderHeights`), provided by the body around every
 * placeholder it draws (its own and each section's).
 */
export const PlaceholderHeightContext = createContext<
  ((p: DataViewPagePlaceholder) => number) | null
>(null);

/**
 * A paged read's pages drawn as placeholders: one element per page, as tall
 * as the rows it stands in for, drawn through `primitives/loading` — never a
 * row, so nothing of it reads as a value. Each carries its `key` as
 * `data-row-key`, so the viewport measures it like a row and reports it to
 * the read, which subscribes the page again once it is near the screen.
 */
export function PagePlaceholders(props: {
  placeholders: readonly DataViewPagePlaceholder[];
}): ReactNode {
  const heightOf = useContext(PlaceholderHeightContext);
  if (props.placeholders.length === 0) return null;
  if (heightOf === null) {
    throw new Error(
      "PagePlaceholders drawn outside a DataView body (no PlaceholderHeightContext)",
    );
  }
  return props.placeholders.map((p) => (
    <div
      key={p.key}
      data-row-key={p.key}
      {...{ [PAGE_PLACEHOLDER_ATTR]: "" }}
      style={{ height: heightOf(p) }}
    >
      <Loading variant="block" className="size-full" />
    </div>
  ));
}
