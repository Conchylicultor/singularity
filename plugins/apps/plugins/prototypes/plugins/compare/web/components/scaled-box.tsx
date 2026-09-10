import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { useResizeObserver } from "@plugins/primitives/plugins/dom/plugins/element-size/web";

/**
 * A rendering laid out at exactly `width` CSS px, then painted at `scale`.
 *
 * This is zoom, not reflow: the content's media queries and wrapping see
 * `width` whatever the scale, so a zoomed-out half shows the same layout as at
 * 100%, only smaller — every proportion kept. Both halves take the same scale,
 * so the comparison stays "at THIS width, do these agree?" while the pair fits
 * on screen.
 *
 * `transform` does not change layout, so the outer box reserves the painted
 * size itself: `width × scale` wide, and the content's own laid-out height times
 * `scale` tall. That height is read from `offsetHeight`, which a transform does
 * not touch — `getBoundingClientRect` would read back the scaled height, and a
 * ResizeObserver never fires for a transform change.
 *
 * At scale 1 there is no transform at all, so a fixture's fixed-position
 * descendant (a popover) keeps the viewport as its containing block.
 */
export function ScaledBox({
  width,
  scale,
  children,
}: {
  width: number;
  scale: number;
  children: ReactNode;
}): ReactElement {
  const innerRef = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  useResizeObserver(innerRef, () => {
    const el = innerRef.current;
    if (el) setNaturalHeight(el.offsetHeight);
  });

  const scaled = scale !== 1;
  return (
    <div
      // Inline geometry, not banned className layout utilities.
      style={{
        width: width * scale,
        // Unscaled, the box takes the content's own height; until the first
        // measure lands (same commit, before paint) there is nothing to reserve.
        height:
          scaled && naturalHeight !== null ? naturalHeight * scale : undefined,
        overflow: "hidden",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width,
          transform: scaled ? `scale(${String(scale)})` : undefined,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
