import { useContext, useState, type ReactNode } from "react";
import { MdOpenInFull } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { clipClasses } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import {
  hoverRevealGroup,
  hoverRevealTargetWithGroupFocus,
} from "@plugins/primitives/plugins/hover-reveal/web";
import { thumbnailShape, type Size, type ThumbnailShape } from "../../core";
import { GalleryContext } from "../internal/gallery-store";
import { useViewerMember } from "../internal/use-image-viewer-trigger";
import { ImageGallery } from "./image-gallery";
import type { ViewerImage } from "../internal/types";

export interface ViewerThumbnailProps {
  image: ViewerImage;
  /**
   * - `inline` (default) — a transcript thumbnail: at most ~240px tall, a
   *   full-page screenshot cropped to its top, an icon at real size on a
   *   checkerboard, and a hover badge with its size.
   * - `chip` — the compact 64px form a composer's pasted attachment uses.
   */
  size?: "inline" | "chip";
  /**
   * Painted over the thumbnail, outside its open button — an attachment chip's
   * Remove button, say. Position it with `<Pin>`. The thumbnail is the
   * hover-reveal group, so `hoverRevealTargetWithGroupFocus` on it reveals it
   * on hover and while the thumbnail has keyboard focus.
   */
  children?: ReactNode;
}

/** The natural size, as far as the thumbnail knows it. */
type Measure =
  { kind: "pending" } | { kind: "loaded"; size: Size } | { kind: "failed" };

/** How the `<img>` is sized, per shape. */
const IMG_CLASS: Record<ThumbnailShape | "chip", string> = {
  normal: "max-h-60 max-w-full",
  // Show the top of a very tall image, not a sliver of all of it.
  tall: "h-60 w-[300px] max-w-full object-cover object-top",
  // Real size; the checker tile around it is what makes it a target.
  tiny: "[image-rendering:pixelated]",
  chip: "max-h-16 max-w-32 object-cover",
};

/** A checkerboard tile from the theme's two neutral tones, behind tiny images
 *  (usually icons with transparent pixels). */
const CHECKER =
  "bg-[conic-gradient(var(--muted)_25%,var(--background)_0_50%,var(--muted)_0_75%,var(--background)_0)] bg-[length:10px_10px]";

/** A dark scrim for text laid over an image. Deliberately not a theme token:
 *  it must read against the picture under it, which no palette knows. */
const SCRIM = "rounded-sm bg-black/60 text-white";

/**
 * An image on the page that opens the full-window viewer when clicked. Inside
 * an `<ImageGallery>` it joins that gallery; outside any, it is a gallery of
 * one — no ← / →, no counter. Nothing expands inline.
 */
export function ViewerThumbnail(props: ViewerThumbnailProps) {
  // The gallery of one is rendered in place, not by some app-root host: the
  // viewer must sit inside this thumbnail's React tree, so a popover or dialog
  // around the thumbnail sees the viewer's clicks and focus as its own rather
  // than as an outside press that dismisses it.
  if (useContext(GalleryContext)) return <Thumbnail {...props} />;
  return (
    <ImageGallery>
      <Thumbnail {...props} />
    </ImageGallery>
  );
}

function Thumbnail({ image, size = "inline", children }: ViewerThumbnailProps) {
  const { attach, open } = useViewerMember<HTMLImageElement>(image);
  const [measure, setMeasure] = useState<Measure>({ kind: "pending" });
  const known: Size | null =
    image.width && image.height
      ? { width: image.width, height: image.height }
      : measure.kind === "loaded"
        ? measure.size
        : null;
  const shape: ThumbnailShape = known ? thumbnailShape(known) : "normal";
  const chip = size === "chip";

  return (
    <span
      className={cn(
        hoverRevealGroup,
        "relative inline-block max-w-full align-top",
      )}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`View image ${image.name}`}
        onClick={open}
        className={cn(
          "focus-ring relative block max-w-full cursor-zoom-in rounded-md border border-border bg-muted transition-colors hover:border-primary/40",
          clipClasses({ axis: "both", fill: false }),
          shape === "tiny" && !chip && cn(CHECKER, "p-lg"),
        )}
      >
        <img
          ref={attach}
          src={image.src}
          alt={image.alt ?? image.name}
          draggable={false}
          onLoad={(e) =>
            setMeasure({
              kind: "loaded",
              size: {
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              },
            })
          }
          onError={() => setMeasure({ kind: "failed" })}
          className={cn(
            "block",
            chip ? IMG_CLASS.chip : IMG_CLASS[shape],
            chip && shape === "tiny" && IMG_CLASS.tiny,
            // Until the size is known the shape is not: keep the image unpainted
            // rather than flash it in the wrong frame.
            known === null && measure.kind === "pending" && "opacity-0",
          )}
        />
        {!chip && shape === "tall" && (
          <Layer
            as="span"
            decorative
            className="bg-linear-to-b from-transparent from-75% to-muted"
          />
        )}
        {!chip && known && (
          <>
            <Pin
              as="span"
              to="bottom-left"
              offset="xs"
              decorative
              className={cn(
                hoverRevealTargetWithGroupFocus,
                SCRIM,
                "px-xs py-2xs text-2xs tabular-nums",
              )}
            >
              {known.width} × {known.height}
            </Pin>
            <Pin
              as="span"
              to="top-right"
              offset="xs"
              decorative
              className={cn(hoverRevealTargetWithGroupFocus, SCRIM, "p-2xs")}
            >
              <MdOpenInFull className="block size-3.5" />
            </Pin>
          </>
        )}
      </button>
      {children}
    </span>
  );
}
