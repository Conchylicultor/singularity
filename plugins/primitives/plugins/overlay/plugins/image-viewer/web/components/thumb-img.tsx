import { useState } from "react";
import { pickSrc } from "../internal/pick-src";
import type { ViewerImage } from "../internal/types";

/**
 * A thumbnail's `<img>`: the caller's resized copy when it offers one (at
 * least `edge` device pixels on the long edge), lazily loaded and decoded off
 * the main thread. A copy that fails to load falls back to the original.
 */
export function ThumbImg({
  image,
  edge,
  className,
}: {
  image: ViewerImage;
  edge: number;
  className: string;
}) {
  const copy = pickSrc(image, edge, false);
  const [failedCopy, setFailedCopy] = useState<string | null>(null);
  const src = failedCopy === copy ? image.src : copy;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        if (src !== image.src) setFailedCopy(copy);
      }}
    />
  );
}
