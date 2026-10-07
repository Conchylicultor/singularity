import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useRevealOnActive } from "@plugins/primitives/plugins/dom/plugins/scroll-reveal/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { TILE_CAPTION_MIN, thumbnailShape, type Area } from "../../core";
import type { ViewerImage } from "../internal/types";

/** Below this aspect (height ÷ width) a tile shows the whole image; above it
 *  — a full-page screenshot — the top of it, like the transcript thumbnail. */
const TALL_RATIO = 1.6;

/** Room kept under the last row so the floating toolbar never covers it. */
const TOOLBAR_CLEARANCE = 24;

function GridTile({
  image,
  index,
  current,
  captions,
  onFocus,
  onOpen,
}: {
  image: ViewerImage;
  index: number;
  current: boolean;
  captions: boolean;
  onFocus(): void;
  onOpen(): void;
}) {
  const reveal = useRevealOnActive(current, {
    revealOnMount: true,
    block: "nearest",
  });
  const known =
    image.width !== undefined && image.height !== undefined
      ? { width: image.width, height: image.height }
      : null;
  const tiny = known !== null && thumbnailShape(known) === "tiny";
  const tall = known !== null && known.height > known.width * TALL_RATIO;
  return (
    <button
      ref={reveal}
      type="button"
      data-grid-tile={index}
      // One tab stop: the selected tile. The arrow keys move between tiles.
      tabIndex={current ? 0 : -1}
      aria-label={image.name}
      aria-current={current}
      onFocus={onFocus}
      onClick={onOpen}
      className="group/tile block w-full text-left focus-visible:outline-none"
    >
      <Stack gap="xs">
        <Clip
          className={cn(
            "relative aspect-[4/3] w-full rounded-md bg-foreground/5 ring-offset-2 ring-offset-background transition-[background-color,box-shadow] group-hover/tile:bg-foreground/10",
            current && "ring-2 ring-primary",
            "group-focus-visible/tile:ring-2 group-focus-visible/tile:ring-primary",
          )}
        >
          <img
            src={image.src}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className={cn(
              "pointer-events-none block size-full",
              tiny
                ? "object-none [image-rendering:pixelated]"
                : tall
                  ? "object-cover object-top"
                  : "object-contain",
            )}
          />
        </Clip>
        {captions && (
          <Line className="gap-sm px-2xs">
            <Fill>
              <Text variant="code">{image.name}</Text>
            </Fill>
            {known && (
              <Text variant="caption" tone="muted" className="tabular-nums">
                {known.width} × {known.height}
              </Text>
            )}
          </Line>
        )}
      </Stack>
    </button>
  );
}

/**
 * Every image as tiles on a solid ground, below the top bar and above the
 * toolbar. `tile` is the slider's minimum tile width — the browser packs as
 * many columns as fit. ⌘-scroll or a pinch on the grid resizes the tiles; a
 * plain scroll scrolls it. Selection is the viewer's own index: focusing a
 * tile selects it, clicking one (or Enter) opens it.
 */
export function ImageGrid({
  images,
  index,
  tile,
  area,
  gridRef,
  onSelect,
  onOpen,
  onResize,
}: {
  images: readonly ViewerImage[];
  index: number;
  tile: number;
  area: Area | null;
  /** The tile grid itself — the viewer reads its column count for ↑ / ↓. */
  gridRef: RefObject<HTMLElement | null>;
  onSelect(index: number): void;
  onOpen(index: number): void;
  /** A ⌘-scroll or pinch asked for tiles `factor` times as large. */
  onResize(factor: number): void;
}) {
  const scrollRef = useRef<HTMLElement>(null);

  // Registered non-passive so a ⌘-scroll or pinch resizes the tiles instead
  // of zooming the page; a plain scroll is left to scroll the grid.
  const resize = useEventCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    onResize(Math.exp(-e.deltaY * 0.01));
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("wheel", resize, { passive: false });
    return () => el.removeEventListener("wheel", resize);
  }, [resize]);

  // Keyboard focus follows the selection: once a tile has focus, an arrow key
  // that moves the selection moves focus with it, so Enter opens what is ringed.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const active = document.activeElement;
    if (!grid || !(active instanceof HTMLElement) || !grid.contains(active))
      return;
    grid
      .querySelector<HTMLElement>(`[data-grid-tile="${index}"]`)
      ?.focus({ preventScroll: true });
  }, [gridRef, index]);

  const captions = tile >= TILE_CAPTION_MIN;
  return (
    <Layer>
      <Layer decorative className="bg-background" />
      <Scroll
        ref={scrollRef}
        axis="y"
        className="relative size-full px-xl"
        style={{
          paddingTop: area?.top,
          paddingBottom: (area?.bottom ?? 0) + TOOLBAR_CLEARANCE,
        }}
      >
        <Grid
          ref={gridRef}
          minCellWidth={`min(${tile}px, 100%)`}
          gap={captions ? "lg" : "sm"}
          aria-label="All images"
          role="group"
        >
          {images.map((image, i) => (
            <GridTile
              key={`${i}:${image.src}`}
              image={image}
              index={i}
              current={i === index}
              captions={captions}
              onFocus={() => onSelect(i)}
              onOpen={() => onOpen(i)}
            />
          ))}
        </Grid>
      </Scroll>
    </Layer>
  );
}
