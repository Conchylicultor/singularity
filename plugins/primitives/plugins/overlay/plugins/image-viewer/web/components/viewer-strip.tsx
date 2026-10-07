import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { clipClasses } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { useRevealOnActive } from "@plugins/primitives/plugins/dom/plugins/scroll-reveal/web";
import { STRIP_HEIGHT, thumbnailShape } from "../../core";
import type { ViewerImage } from "../internal/types";
import { PANEL } from "./viewer-chrome";

/** One image in the strip. Its own component so each owns its reveal: the
 *  current one scrolls into view when it becomes current (and on mount, so
 *  docking the strip shows where you are). */
function StripThumb({
  image,
  current,
  onSelect,
}: {
  image: ViewerImage;
  current: boolean;
  onSelect(): void;
}) {
  const reveal = useRevealOnActive(current, {
    revealOnMount: true,
    inline: "center",
    block: "nearest",
  });
  const tiny =
    image.width !== undefined &&
    image.height !== undefined &&
    thumbnailShape({ width: image.width, height: image.height }) === "tiny";
  return (
    <button
      ref={reveal}
      type="button"
      title={image.name}
      aria-label={image.name}
      aria-current={current}
      onClick={onSelect}
      className={cn(
        // The auto margins centre a short strip and let a long one scroll from its true start.
        clipClasses({ axis: "both", fill: false }),
        // A thumbnail keeps its size however many there are: the band scrolls.
        rigidClass(),
        "relative block h-14 w-20 rounded-md border-2 border-transparent bg-foreground/10 opacity-55 transition-[opacity,border-color] first:ms-auto last:me-auto hover:opacity-90 focus-visible:opacity-100 focus-visible:outline-none",
        current && "border-primary opacity-100",
      )}
    >
      <img
        src={image.src}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        className={cn(
          "pointer-events-none block size-full object-cover object-top",
          tiny && "object-contain p-sm [image-rendering:pixelated]",
        )}
      />
    </button>
  );
}

/**
 * Every image as a band docked along the viewer's bottom edge, under the
 * toolbar: the current one ringed, a click jumps to that image. It does not
 * join the controls' idle fade — a docked band that vanished would leave an
 * empty strip of screen the image does not use.
 */
export function ThumbnailStrip({
  images,
  index,
  onSelect,
}: {
  images: readonly ViewerImage[];
  index: number;
  onSelect(index: number): void;
}) {
  return (
    <Pin
      to="bottom"
      stretch
      data-viewer-chrome
      className={cn(PANEL, "rounded-none border-x-0 border-b-0")}
      style={{ height: STRIP_HEIGHT }}
    >
      <Scroll axis="x" className="size-full">
        <Line
          role="group"
          aria-label="All images"
          className="h-full gap-sm px-md"
        >
          {images.map((image, i) => (
            <StripThumb
              key={`${i}:${image.src}`}
              image={image}
              current={i === index}
              onSelect={() => onSelect(i)}
            />
          ))}
        </Line>
      </Scroll>
    </Pin>
  );
}
