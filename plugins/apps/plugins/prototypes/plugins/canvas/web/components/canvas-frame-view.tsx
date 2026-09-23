import type { ReactElement, ReactNode } from "react";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { matchResource } from "@plugins/primitives/plugins/live-state/web";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  CANVAS_FRAME_ATTR,
  CANVAS_FRAME_KIND_ATTR,
  CANVAS_FRAME_STATUS_ATTR,
  PROTOTYPE_FRAME_KIND,
  type CanvasFrameStatus,
} from "@plugins/apps/plugins/prototypes/plugins/canvas/core";
import type {
  CanvasFrame,
  PrototypeFrame as PrototypeFrameModel,
  SourceFrame,
} from "../internal/canvas-model";
import type { FrameLayout } from "../internal/layout";
import { FrameSource, type FrameResolution } from "../slots";
import { useFrameSrc } from "../context";
import { PrototypeFrame } from "./prototype-frame";

/** Everything the frame view is sized by, and the letter it publishes. */
export interface CanvasFrameViewProps {
  frame: CanvasFrame;
  meta: PrototypeMeta;
  /** The live `prototypesVersionResource` value: an edit reloads live frames. */
  cacheBust: number;
  /** The canvas-wide logical size and scale (`layoutFrames`). */
  layout: FrameLayout;
  /** The frame's letter, published for drivers (`data-canvas-frame`). */
  letter: string;
  wholePage?: boolean;
  /** This frame's measured page height, when Whole page is on. */
  pageHeight?: number | null;
  onPageHeight?: (height: number) => void;
  /**
   * Wrap the screen in chrome that needs what a source frame resolved to (its
   * tag): the canvas's frame header, Present's hover tag. Defaults to the
   * screen alone. The resolution is `null` for a prototype frame.
   */
  children?: (
    screen: ReactNode,
    resolution: FrameResolution | null,
  ) => ReactNode;
}

/**
 * One frame of the canvas: its screen — a box at the canvas's size and scale —
 * showing either the prototype (its version, under its picks) or what a frame
 * source resolved to. Exported so Present renders the very same frame.
 */
export function CanvasFrameView(props: CanvasFrameViewProps): ReactElement {
  return props.frame.kind === "prototype" ? (
    <PrototypeFrameView {...props} frame={props.frame} />
  ) : (
    <SourceFrameView {...props} frame={props.frame} />
  );
}

function PrototypeFrameView({
  frame,
  meta,
  cacheBust,
  layout,
  letter,
  wholePage = false,
  pageHeight = null,
  onPageHeight = ignoreHeight,
  children = justScreen,
}: CanvasFrameViewProps & { frame: PrototypeFrameModel }): ReactElement {
  const src = useFrameSrc(frame, meta, cacheBust);
  const screen = (
    <Screen
      layout={layout}
      letter={letter}
      kind={PROTOTYPE_FRAME_KIND}
      status={src.pending ? "loading" : "found"}
    >
      {/* No `error` arm: a picks record that cannot be read stays broken
          until someone fixes it, so it renders the default error placeholder
          naming the problem — never a spinner that never ends. */}
      {matchResource(src, {
        pending: () => <Loading variant="block" />,
        ready: (url) => (
          <PrototypeFrame
            src={url}
            title={meta.title}
            width={layout.width}
            height={layout.height}
            scale={layout.scale}
            wholePage={wholePage}
            pageHeight={pageHeight}
            onPageHeight={onPageHeight}
          />
        ),
      })}
    </Screen>
  );
  return <>{children(screen, null)}</>;
}

function SourceFrameView({
  frame,
  meta,
  layout,
  letter,
  children = justScreen,
}: CanvasFrameViewProps & { frame: SourceFrame }): ReactElement {
  return (
    <FrameSource.Dispatch source={frame.source} meta={meta}>
      {(resolution) =>
        children(
          <Screen
            layout={layout}
            letter={letter}
            kind={frame.source}
            status={resolution.status}
          >
            <SourceBody resolution={resolution} layout={layout} />
          </Screen>,
          resolution,
        )
      }
    </FrameSource.Dispatch>
  );
}

/** A frame source's answer, painted inside the screen. */
function SourceBody({
  resolution,
  layout,
}: {
  resolution: FrameResolution;
  layout: FrameLayout;
}): ReactElement {
  switch (resolution.status) {
    case "loading":
      return (
        <Inset pad="lg">
          <Loading label={resolution.label ?? "Loading…"} />
        </Inset>
      );
    case "unresolved":
      // Prose, not a rendering: it reflows inside the screen instead of zooming.
      return (
        <Inset pad="lg">
          <Stack gap="sm">
            <Text variant="body">{resolution.title}</Text>
            {typeof resolution.detail === "string" ? (
              <Text variant="body" tone="muted">
                {resolution.detail}
              </Text>
            ) : (
              resolution.detail
            )}
          </Stack>
        </Inset>
      );
    case "found":
      return (
        // One crashing source costs its own frame, not the canvas.
        <PluginErrorBoundary
          slot="prototype-canvas-frame"
          label={resolution.tag}
        >
          <div
            // Laid out at the logical size, then scaled like a prototype frame.
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${String(layout.scale)})`,
              transformOrigin: "top left",
            }}
          >
            {resolution.render(layout.width, layout.height)}
          </div>
        </PluginErrorBoundary>
      );
  }
}

/**
 * The screen box: the canvas's size at its scale, rounded and ringed, clipping
 * what it shows. The box a driver photographs (`data-canvas-frame*`).
 */
function Screen({
  layout,
  letter,
  kind,
  status,
  children,
}: {
  layout: FrameLayout;
  letter: string;
  kind: string;
  status: CanvasFrameStatus;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      className="relative rounded-md bg-background ring-1 ring-border"
      style={{
        width: layout.width * layout.scale,
        height: layout.visibleHeight * layout.scale,
        overflow: "hidden",
      }}
      {...{
        [CANVAS_FRAME_ATTR]: letter,
        [CANVAS_FRAME_KIND_ATTR]: kind,
        [CANVAS_FRAME_STATUS_ATTR]: status,
      }}
    >
      {children}
    </div>
  );
}

function justScreen(screen: ReactNode): ReactNode {
  return screen;
}

function ignoreHeight(): void {}
