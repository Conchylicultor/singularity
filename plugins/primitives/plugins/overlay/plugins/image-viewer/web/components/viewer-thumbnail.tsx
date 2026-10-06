import { useContext, type ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { clipClasses } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import {
  hoverRevealGroup,
  hoverRevealTargetWithGroupFocus,
} from "@plugins/primitives/plugins/hover-reveal/web";
import { thumbnailShape, type Size, type ThumbnailShape } from "../../core";
import { GalleryContext } from "../internal/gallery-store";
import { useViewerMember } from "../internal/use-image-viewer-trigger";
import { useImageLoad } from "../internal/use-image-load";
import { ImageGallery } from "./image-gallery";
import { MissingImage } from "./missing-image";
import type { ViewerImage } from "../internal/types";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const openInFullIcon = symbol("open-in-full");

export interface ViewerThumbnailProps {
  image: ViewerImage;
  /**
   * - `inline` (default) — a transcript thumbnail: the whole image, shrunk to
   *   fit at most ~240px tall and the available width, an icon at real size on
   *   a checkerboard, and a hover badge with its size.
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

/** How the `<img>` is sized, per shape. */
const IMG_CLASS: Record<ThumbnailShape | "chip", string> = {
  // Two max bounds and no set size: the browser shrinks the image, keeping its
  // aspect, until both hold — so the longer axis sets the scale and the whole
  // picture shows.
  normal: "max-h-60 max-w-full",
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
  const { load, imgKey, imgProps, retry } = useImageLoad(image.src);
  const known: Size | null =
    image.width && image.height
      ? { width: image.width, height: image.height }
      : load.kind === "loaded"
        ? load.size
        : null;
  const shape: ThumbnailShape = known ? thumbnailShape(known) : "normal";
  const chip = size === "chip";

  if (load.kind === "failed") {
    // No <img>, so `attach` is handed null and the image leaves its gallery:
    // ← / → skip it, and there is nothing to open.
    return (
      <span
        className={cn(
          hoverRevealGroup,
          "relative inline-block max-w-full align-top",
        )}
      >
        <MissingImage
          name={image.name}
          title={image.alt}
          reason={load.reason}
          onRetry={retry}
          size={size}
        />
        {children}
      </span>
    );
  }

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
          key={imgKey}
          ref={attach}
          src={image.src}
          alt={image.alt ?? image.name}
          draggable={false}
          {...imgProps}
          className={cn(
            "block",
            chip ? IMG_CLASS.chip : IMG_CLASS[shape],
            chip && shape === "tiny" && IMG_CLASS.tiny,
            // Until the size is known the shape is not: keep the image unpainted
            // rather than flash it in the wrong frame.
            known === null && "opacity-0",
          )}
        />
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
              <Icon icon={openInFullIcon} className="block size-3.5" />
            </Pin>
          </>
        )}
      </button>
      {children}
    </span>
  );
}
