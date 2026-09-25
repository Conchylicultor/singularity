import { useState, type ReactElement, type ReactNode } from "react";
import { useElementSize } from "@plugins/primitives/plugins/dom/plugins/element-size/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Placed } from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  documentOptions,
  usePrototypeDetail,
  useStoredPicksOf,
} from "../context";
import {
  prototypeFrames,
  type CanvasFrame,
  type FrameId,
} from "../internal/canvas-model";
import {
  BOARD_PAD,
  FRAME_GAP,
  layoutFrames,
  roomPerFrame,
  type FrameLayout,
} from "../internal/layout";
import { useWindowSize } from "../internal/use-window-size";
import { frameName, letterOf, type NamedFrame } from "../internal/frame-name";
import { CanvasFrameView } from "./canvas-frame-view";
import { FrameHeader, FRAME_HEADER_GAP } from "./frame-header";
import { OptionsPill } from "./options-pill";
import { SizeChip } from "./size-chip";
import { CanvasShortcuts } from "./canvas-shortcuts";

/**
 * The canvas: every frame, side by side and centred (scrolling when they are
 * bigger than the pane), all at one size and zoom — or, with exactly two frames
 * and the Swipe layout, one swiped over the other. The size & zoom chip sits in
 * its bottom-right corner.
 */
export function Canvas({
  meta,
  cacheBust,
}: {
  meta: PrototypeMeta;
  cacheBust: number;
}): ReactElement {
  const { canvas } = usePrototypeDetail();
  const [roomRef, room] = useElementSize<HTMLDivElement>();
  const browserWindow = useWindowSize();
  // Each prototype frame's measured page height, for Whole page: the frames
  // are fitted to the tallest.
  const [pageHeights, setPageHeights] = useState<ReadonlyMap<FrameId, number>>(
    () => new Map(),
  );
  const reportHeight = (id: FrameId) => (h: number) =>
    setPageHeights((prev) =>
      prev.get(id) === h ? prev : new Map(prev).set(id, h),
    );

  const swipe = canvas.layout === "swipe" && canvas.frames.length === 2;
  const per = roomPerFrame(
    { w: room.width, h: room.height },
    swipe ? 1 : canvas.frames.length,
  );
  const tallest = canvas.wholePage
    ? canvas.frames.reduce<number | null>((max, f) => {
        const h = pageHeights.get(f.id);
        return h === undefined ? max : Math.max(max ?? 0, h);
      }, null)
    : null;
  const layout = layoutFrames({
    room: per,
    size: canvas.size,
    browserWindow,
    zoom: canvas.zoom,
    wholePage: canvas.wholePage,
    pageHeight: tallest,
  });
  const names = useFrameNames(meta);
  const measured = room.width > 0 && room.height > 0;

  return (
    <div className="relative h-full bg-muted/40">
      <CanvasShortcuts />
      <Scroll ref={roomRef} axis="both" className="h-full">
        {measured ? (
          <Stack
            direction="row"
            gap="none"
            align="start"
            style={{
              gap: FRAME_GAP,
              padding: `${String(BOARD_PAD.top)}px ${String(BOARD_PAD.x)}px ${String(BOARD_PAD.bottom)}px`,
              minWidth: "max-content",
              minHeight: "100%",
            }}
          >
            {swipe ? (
              <SwipeFrames
                meta={meta}
                cacheBust={cacheBust}
                layout={layout}
                names={names}
              />
            ) : (
              canvas.frames.map((frame, index) => (
                <FrameCard
                  key={frame.id}
                  frame={frame}
                  index={index}
                  first={index === 0}
                  last={index === canvas.frames.length - 1}
                  meta={meta}
                  cacheBust={cacheBust}
                  layout={layout}
                  name={names(frame)}
                  pageHeight={pageHeights.get(frame.id) ?? null}
                  onPageHeight={reportHeight(frame.id)}
                />
              ))
            )}
          </Stack>
        ) : null}
      </Scroll>
      <Pin to="bottom-right" offset="md">
        <SizeChip layout={layout} />
      </Pin>
    </div>
  );
}

/**
 * Every frame's name: a prototype frame by its variant (`frameName`), falling
 * back to the prototype's title when it declares no option; a source frame by
 * its source's add label ("Real app"). Exported for Present, whose tag names
 * the frame on show the way its header does.
 */
export function useFrameNames(
  meta: PrototypeMeta,
): (frame: CanvasFrame) => string {
  const { canvas, sources } = usePrototypeDetail();
  const picksOf = useStoredPicksOf();
  const named: NamedFrame[] = prototypeFrames(canvas.frames).map((f) => ({
    id: f.id,
    options: documentOptions(meta, f.version),
    picks: picksOf(f),
  }));
  return (frame) => {
    if (frame.kind === "source") {
      return (
        sources.find((s) => s.id === frame.source)?.addLabel ?? frame.source
      );
    }
    const target = named.find((n) => n.id === frame.id);
    const parts = target ? frameName(target, named) : [];
    return parts.length > 0 ? parts.join(" · ") : meta.title;
  };
}

/**
 * One frame on the board: header, screen and the options pill. Centred by auto margins (not `justify-content: center`), so
 * frames bigger than the canvas scroll instead of clipping.
 */
function FrameCard({
  frame,
  index,
  first,
  last,
  meta,
  cacheBust,
  layout,
  name,
  pageHeight,
  onPageHeight,
}: {
  frame: CanvasFrame;
  index: number;
  first: boolean;
  last: boolean;
  meta: PrototypeMeta;
  cacheBust: number;
  layout: FrameLayout;
  name: string;
  pageHeight: number | null;
  onPageHeight: (h: number) => void;
}): ReactElement {
  const { canvas, dispatch } = usePrototypeDetail();
  const selected = canvas.selected === frame.id;
  const screenWidth = layout.width * layout.scale;

  return (
    <div
      className={cn("relative", hoverRevealGroup)}
      style={{
        width: screenWidth,
        marginBlock: "auto",
        marginLeft: first ? "auto" : undefined,
        marginRight: last ? "auto" : undefined,
      }}
    >
      <CanvasFrameView
        frame={frame}
        meta={meta}
        cacheBust={cacheBust}
        layout={layout}
        letter={letterOf(index)}
        wholePage={canvas.wholePage}
        pageHeight={pageHeight}
        onPageHeight={onPageHeight}
      >
        {(screen, resolution) => (
          <Stack gap="none" style={{ gap: FRAME_HEADER_GAP }}>
            <FrameHeader
              frame={frame}
              meta={meta}
              name={name}
              resolution={resolution}
              actionsClassName={selected ? undefined : cn(hoverRevealTarget)}
            />
            <SelectableScreen
              selected={selected}
              onSelect={() => dispatch({ type: "select", id: frame.id })}
            >
              {screen}
              {frame.kind === "prototype" ? (
                // Sticks to the bottom of the view while its frame runs taller
                // than the canvas; revealed on hover. Zero height, inside the
                // screen's box, so it adds nothing to the frame's height.
                <Sticky edge="bottom" offset="md" className="h-0">
                  <div className="relative">
                    <Pin
                      to={screenWidth < 480 ? "bottom-left" : "bottom"}
                      offset="md"
                      className={hoverRevealTarget}
                    >
                      <OptionsPill frame={frame} meta={meta} />
                    </Pin>
                  </div>
                </Sticky>
              ) : null}
            </SelectableScreen>
          </Stack>
        )}
      </CanvasFrameView>
    </div>
  );
}

/**
 * The screen; clicking an unselected one selects it (what `[` `]` and `0` then
 * act on). Selection draws no ring — it shows only as the header's actions
 * staying visible, so the last-clicked frame never wears a distracting border.
 */
function SelectableScreen({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      className={cn("rounded-md", !selected && "cursor-pointer")}
      // A click inside a frame's iframe never reaches this document, but the
      // iframe taking focus does (focusin on the iframe element).
      onPointerDownCapture={selected ? undefined : onSelect}
      onFocusCapture={selected ? undefined : onSelect}
    >
      {children}
    </div>
  );
}

/**
 * Swipe: the two frames in ONE box, B under A, A clipped at the divider — drag
 * the divider to wipe one design over the other.
 */
function SwipeFrames({
  meta,
  cacheBust,
  layout,
  names,
}: {
  meta: PrototypeMeta;
  cacheBust: number;
  layout: FrameLayout;
  names: (frame: CanvasFrame) => string;
}): ReactElement | null {
  const { canvas, dispatch } = usePrototypeDetail();
  const [dragging, setDragging] = useState(false);
  const [a, b] = canvas.frames;
  if (a === undefined || b === undefined) return null;
  const width = layout.width * layout.scale;
  const height = layout.visibleHeight * layout.scale;
  const at = canvas.swipeAt;

  const moveTo = (clientX: number, box: HTMLElement) => {
    const rect = box.getBoundingClientRect();
    dispatch({ type: "setSwipeAt", at: (clientX - rect.left) / rect.width });
  };

  // Each frame renders ONCE: B's view wraps A's, so both screens and both
  // resolutions (a source frame's tag) are in hand for the one composition.
  return (
    <CanvasFrameView
      frame={b}
      meta={meta}
      cacheBust={cacheBust}
      layout={layout}
      letter={letterOf(1)}
    >
      {(screenB, resolutionB) => (
        <CanvasFrameView
          frame={a}
          meta={meta}
          cacheBust={cacheBust}
          layout={layout}
          letter={letterOf(0)}
        >
          {(screenA, resolutionA) => (
            <Stack
              gap="none"
              style={{
                gap: FRAME_HEADER_GAP,
                width,
                marginBlock: "auto",
                marginInline: "auto",
              }}
            >
              <Stack direction="row" gap="lg" align="center">
                <FrameHeader
                  frame={a}
                  meta={meta}
                  name={names(a)}
                  resolution={resolutionA}
                />
                <Text
                  variant="caption"
                  tone="faint"
                  className="whitespace-nowrap"
                >
                  ← drag →
                </Text>
                <FrameHeader
                  frame={b}
                  meta={meta}
                  name={names(b)}
                  resolution={resolutionB}
                />
              </Stack>
              <div className="relative" style={{ width, height }}>
                {screenB}
                <Placed
                  x="fill"
                  y="fill"
                  style={{
                    clipPath: `inset(0 ${String((1 - at) * 100)}% 0 0)`,
                  }}
                >
                  {screenA}
                </Placed>
                <Placed
                  x={{ start: `${String(at * 100)}%`, size: 2, shift: "-50%" }}
                  y="fill"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Drag to swipe between the two frames"
                  className={cn(
                    "cursor-ew-resize touch-none",
                    dragging ? "bg-primary" : "bg-foreground",
                  )}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging(true);
                  }}
                  onPointerMove={(e) => {
                    if (!dragging) return;
                    const box = e.currentTarget.parentElement;
                    if (box) moveTo(e.clientX, box);
                  }}
                  onPointerUp={() => setDragging(false)}
                  onPointerCancel={() => setDragging(false)}
                />
              </div>
            </Stack>
          )}
        </CanvasFrameView>
      )}
    </CanvasFrameView>
  );
}
