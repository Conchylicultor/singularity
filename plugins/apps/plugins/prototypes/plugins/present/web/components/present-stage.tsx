import { useState, type ReactElement, type ReactNode } from "react";
import {
  matchResource,
  useCombinedResources,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  Button,
  ControlSizeProvider,
  cn,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { useElementSize } from "@plugins/primitives/plugins/dom/plugins/element-size/web";
import { hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import {
  prototypesResource,
  prototypesVersionResource,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  CanvasFrameView,
  FrameLetter,
  OptionsPill,
  SizeChip,
  VersionStepper,
  frameA,
  layoutFrames,
  letterOf,
  useFrameNames,
  usePrototypeDetail,
  type CanvasFrame,
  type FrameId,
  type FrameResolution,
} from "@plugins/apps/plugins/prototypes/plugins/canvas/web";

/** The Exit button, and which top corner it takes. */
export interface PresentExit {
  onExit: () => void;
  /**
   * `left` puts it beside the tag, top-left — for a presentation that leaves
   * the app's floating chrome (the global action bar, top-right) above it.
   */
  side: "left" | "right";
}

/**
 * What every presentation shows — the in-app overlays and the new-tab page
 * alike: ONE canvas frame, sized by the canvas-wide size, zoom and Whole page
 * computed for the room the presentation has (so "Phone at Fit" is a phone
 * filling the screen, "Responsive at Fit" the page at the screen's own width).
 *
 * Hovering shows the chrome: the frame's tag (letter, name, version stepper,
 * and "i of n · ← →" when there are more frames), Exit, the options pill
 * (bottom centre) and the size & zoom chip (bottom right).
 */
export function PresentStage({
  name,
  frameId,
  exit,
}: {
  name: string;
  /** The frame on show — frame A when absent or gone. */
  frameId?: FrameId;
  /** Absent on the new-tab page: closing the tab is how you leave. */
  exit?: PresentExit;
}): ReactNode {
  const stage = useCombinedResources({
    rows: useResource(prototypesResource),
    version: useResource(prototypesVersionResource),
  });
  return matchResource(stage, {
    pending: () => <Loading variant="block" />,
    ready: ({ rows, version }) => {
      const meta = rows.find((p) => p.name === name) ?? null;
      if (!meta) {
        return (
          <Text as="div" variant="body" tone="muted" className="p-lg">
            Prototype not found.
          </Text>
        );
      }
      return (
        <PresentedFrame
          meta={meta}
          cacheBust={version}
          frameId={frameId}
          exit={exit}
        />
      );
    },
  });
}

function PresentedFrame({
  meta,
  cacheBust,
  frameId,
  exit,
}: {
  meta: PrototypeMeta;
  cacheBust: number;
  frameId: FrameId | undefined;
  exit: PresentExit | undefined;
}): ReactElement {
  const { canvas } = usePrototypeDetail();
  const [roomRef, room] = useElementSize<HTMLDivElement>();
  // The shown frame's measured page height, for Whole page. Keyed by frame so
  // flipping to another frame never fits it to the previous one's page.
  const [page, setPage] = useState<{ id: FrameId; h: number } | null>(null);
  const frame: CanvasFrame | null =
    canvas.frames.find((f) => f.id === frameId) ?? frameA(canvas.frames);
  if (frame === null) {
    return (
      <Text as="div" variant="body" tone="muted" className="p-lg">
        Nothing to present.
      </Text>
    );
  }
  const index = canvas.frames.indexOf(frame);
  const pageHeight = page?.id === frame.id ? page.h : null;
  const layout = layoutFrames({
    room: { w: Math.max(1, room.width), h: Math.max(1, room.height) },
    size: canvas.size,
    zoom: canvas.zoom,
    wholePage: canvas.wholePage,
    pageHeight,
  });

  return (
    <CanvasFrameView
      frame={frame}
      meta={meta}
      cacheBust={cacheBust}
      layout={layout}
      letter={letterOf(index)}
      wholePage={canvas.wholePage}
      pageHeight={pageHeight}
      onPageHeight={(h) =>
        setPage((prev) =>
          prev?.id === frame.id && prev.h === h ? prev : { id: frame.id, h },
        )
      }
    >
      {(screen, resolution) => (
        <>
          {/* Bigger than the room (a zoom past Fit, a tall Whole page): it
              scrolls. Otherwise centred by auto margins, which — unlike
              `justify-content: center` — never clip the overflowing side. */}
          <Scroll ref={roomRef} axis="both" className="size-full">
            {room.width > 0 ? (
              <Stack
                direction="row"
                gap="none"
                style={{ minWidth: "max-content", minHeight: "100%" }}
              >
                <div style={{ margin: "auto" }}>{screen}</div>
              </Stack>
            ) : null}
          </Scroll>
          <Pin to="top-left" offset="md" className={hoverRevealTarget}>
            <Stack direction="row" gap="sm" align="center">
              <FrameTag
                frame={frame}
                index={index}
                count={canvas.frames.length}
                meta={meta}
                resolution={resolution}
              />
              {exit?.side === "left" ? (
                <ExitButton onExit={exit.onExit} />
              ) : null}
            </Stack>
          </Pin>
          {exit?.side === "right" ? (
            <Pin to="top-right" offset="md" className={hoverRevealTarget}>
              <ExitButton onExit={exit.onExit} />
            </Pin>
          ) : null}
          {frame.kind === "prototype" ? (
            <Pin to="bottom" offset="lg" className={hoverRevealTarget}>
              <OptionsPill frame={frame} meta={meta} />
            </Pin>
          ) : null}
          <Pin to="bottom-right" offset="md" className={hoverRevealTarget}>
            <SizeChip layout={layout} />
          </Pin>
        </>
      )}
    </CanvasFrameView>
  );
}

/** The frame tag's card look (the Exit button beside it is `variant="floating"`). */
const CHROME = "rounded-md border border-border bg-background shadow-md";

/**
 * The frame's tag: its letter and name, what it shows (the version stepper for
 * the prototype, the source's tag otherwise), and — with more than one frame —
 * where it sits among them and the keys that flip through them.
 */
function FrameTag({
  frame,
  index,
  count,
  meta,
  resolution,
}: {
  frame: CanvasFrame;
  index: number;
  count: number;
  meta: PrototypeMeta;
  resolution: FrameResolution | null;
}): ReactElement {
  const { dispatch } = usePrototypeDetail();
  const names = useFrameNames(meta);
  return (
    <ControlSizeProvider size="xs">
      <Stack
        direction="row"
        gap="sm"
        align="center"
        className={cn(CHROME, "h-8 pl-xs pr-2xs")}
      >
        <FrameLetter index={index} />
        <Text variant="label" className="whitespace-nowrap">
          {names(frame)}
        </Text>
        {frame.kind === "prototype" ? (
          <VersionStepper
            name={meta.name}
            letter={letterOf(index)}
            shown={frame.version}
            show={(version) =>
              dispatch({ type: "setVersion", id: frame.id, version })
            }
          />
        ) : resolution?.status === "found" ? (
          <Badge variant="success">{resolution.tag}</Badge>
        ) : null}
        {count > 1 ? (
          <Text
            variant="caption"
            tone="faint"
            className="whitespace-nowrap pr-xs"
          >
            {index + 1} of {count} · ← →
          </Text>
        ) : null}
      </Stack>
    </ControlSizeProvider>
  );
}

function ExitButton({ onExit }: { onExit: () => void }): ReactElement {
  return (
    <Button
      variant="floating"
      className="rounded-md"
      aria-label="Exit presentation (Esc)"
      onClick={onExit}
    >
      Exit
      <Kbd>Esc</Kbd>
    </Button>
  );
}
