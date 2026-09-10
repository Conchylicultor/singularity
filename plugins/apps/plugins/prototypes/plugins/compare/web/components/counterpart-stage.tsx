import { useState, type ReactElement, type ReactNode, type Ref } from "react";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import type { CounterpartResolution, WidthChoices } from "../types";
import { MockFrame } from "./mock-frame";
import { ScaledBox } from "./scaled-box";
import { usePairRoom } from "./use-pair-room";
import { fitPair, type PairLayout } from "../fit-pair";

/**
 * Widths to offer while the counterpart has none to offer — it is still
 * loading, or could not be resolved. The mock half still renders at a real
 * width in those states, so there is always a list to pick from.
 */
const PLACEHOLDER_WIDTHS: WidthChoices = [360, 640, 960];

/**
 * How the pair is painted. `fit` zooms both halves out by one factor until the
 * whole pair fits the pane — both axes, side by side or stacked, whichever
 * paints them bigger (never zooming in); `actual` paints them side by side at
 * 100% and lets the stage scroll. Zoom never changes the width they are LAID
 * OUT at.
 */
type Zoom = "fit" | "actual";

/**
 * The stage's chrome: both halves, at ONE width.
 *
 * Shared width IS the comparison affordance: one control moves both, so the
 * reader is always asking "at this width, do these agree?" rather than trading
 * room between the two — which a draggable divider would do, and which would
 * make every reading a different question. The width list is the counterpart's
 * own (`resolution.widths`): the widths it has something to say about.
 *
 * The mock half renders in EVERY arm. The mock is known the moment the pane
 * opens; making it wait on the counterpart would be a second unknown standing
 * in for a known thing.
 */
export function CounterpartStage({
  resolution,
  meta,
  version,
}: {
  resolution: CounterpartResolution;
  meta: PrototypeMeta;
  version: number;
}): ReactElement {
  const widths =
    resolution.status === "found" ? resolution.widths : PLACEHOLDER_WIDTHS;

  // The width, not the index: a picked width survives the counterpart changing
  // under it (the reader opens another prototype in the same pane), and one the
  // new list does not offer falls back rather than leaving the halves at a
  // width nothing declares.
  const [picked, setPicked] = useState<number | null>(null);
  const width =
    picked !== null && widths.includes(picked)
      ? picked
      : defaultWidth(widths, meta);

  const [zoom, setZoom] = useState<Zoom>("fit");
  const fit = zoom === "fit";
  // ONE scale for both halves, fitted to the room the stage measures. The pair
  // is fitted to the MOCK's size — it renders in every arm, so there is always
  // one to fit — and a route counterpart's frame is that same box by
  // construction. Before the first measure (same commit, before paint) the
  // pair sits side by side at 100%.
  const { roomRef, pairRef, halfRef, frameRef, measured } = usePairRoom();
  const { direction, scale }: PairLayout =
    fit && measured !== null
      ? fitPair({ ...measured, unit: { width, height: meta.viewport.h } })
      : { direction: "row", scale: 1 };

  return (
    <Column
      className="h-full"
      header={
        <Bar tier="pane">
          <Stack direction="row" gap="sm" align="center">
            <Text variant="label">Width</Text>
            {/* One choice is not a choice; the control would be a label. */}
            {widths.length > 1 ? (
              <SegmentedControl<string>
                options={widths.map((w) => ({
                  id: String(w),
                  label: `${String(w)}px`,
                }))}
                value={String(width)}
                onChange={(id) => setPicked(Number(id))}
              />
            ) : (
              <Text variant="caption" tone="muted">{`${String(width)}px`}</Text>
            )}
            <Text variant="label">Zoom</Text>
            <SegmentedControl<Zoom>
              options={[
                {
                  id: "fit",
                  label:
                    fit && scale < 1
                      ? `Fit · ${String(Math.round(scale * 100))}%`
                      : "Fit",
                  title:
                    "Zoom both halves out together until the pair fits the pane — side by side, or stacked when that shows them bigger",
                },
                { id: "actual", label: "100%", title: "Actual size" },
              ]}
              value={zoom}
              onChange={setZoom}
            />
            {/* The ref is an identifier, which is what Badge's `mono` is for. */}
            {resolution.status === "found" && resolution.badge !== undefined ? (
              <Badge mono>{resolution.badge}</Badge>
            ) : null}
          </Stack>
        </Bar>
      }
      body={
        // `h-full`, not `fill`: `scrollBody={false}` wraps the body in a plain
        // BLOCK div, so `fill`'s `min-h-0 flex-1` would be inert there and the
        // overflow would never engage. That div is itself a flex child with a
        // resolved height, so 100% of it is a real height to scroll inside.
        // Column's own managed body is not an option — it scrolls y only, and
        // two fixed-width halves in a row need x.
        <Scroll axis="both" className="h-full">
          {/* Under Fit the inset and the room are pinned to the pane's height,
              so the room measures the space the pair may fill rather than the
              pair itself. At 100% they hug the content, which scrolls. */}
          <Inset pad="sm" className={fit ? "h-full" : undefined}>
            <Stack
              ref={roomRef}
              gap="none"
              className={fit ? "h-full" : undefined}
            >
              {/* `m-auto` centres the pair in whatever the fit leaves over, and
                  — unlike `place-items: center` — falls back to the top-left
                  edge when the pair is the larger (100%, or a fixture taller
                  than the mock), so none of it is pushed out of scroll reach. */}
              <Stack
                ref={pairRef}
                direction={direction}
                gap="sm"
                align="start"
                className="m-auto"
              >
                <Half
                  title="Prototype mock"
                  subtitle={meta.title}
                  halfRef={halfRef}
                  frameRef={frameRef}
                >
                  <ScaledBox width={width} scale={scale}>
                    {/* The prototype's declared viewport height: the frame is as
                        tall as the mock says it means to be, and as wide as the
                        stage says. */}
                    <MockFrame
                      meta={meta}
                      version={version}
                      height={meta.viewport.h}
                    />
                  </ScaledBox>
                </Half>
                <CounterpartHalf
                  resolution={resolution}
                  width={width}
                  scale={scale}
                />
              </Stack>
            </Stack>
          </Inset>
        </Scroll>
      }
      scrollBody={false}
    />
  );
}

/** The counterpart half, per resolution arm. */
function CounterpartHalf({
  resolution,
  width,
  scale,
}: {
  resolution: CounterpartResolution;
  width: number;
  scale: number;
}): ReactElement {
  // A notice is prose, not a rendering to compare: it takes the half's painted
  // width so the two halves line up, but reflows inside it instead of zooming.
  const noticeWidth = { width: width * scale };
  switch (resolution.status) {
    case "loading":
      return (
        <Half title="Counterpart">
          <Inset pad="lg" style={noticeWidth}>
            <Loading label={resolution.label ?? "Loading the counterpart…"} />
          </Inset>
        </Half>
      );
    case "unresolved":
      return (
        <Half title="Counterpart">
          <Inset pad="lg" style={noticeWidth}>
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
        </Half>
      );
    case "found":
      return (
        <Half title={resolution.title} subtitle={resolution.subtitle}>
          {/*
            One crashing counterpart must cost its own half, not the pane. A kind
            renders arbitrary code from an arbitrary plugin — a fixture, a whole
            app — and the slot middleware's boundary is the whole pane, which
            would take the mock down with it and leave nothing to compare against.
          */}
          <PluginErrorBoundary
            slot="prototype-compare"
            label={`${resolution.badge ?? resolution.title} @ ${String(width)}px`}
          >
            <ScaledBox width={width} scale={scale}>
              {resolution.render(width)}
            </ScaledBox>
          </PluginErrorBoundary>
        </Half>
      );
  }
}

/**
 * One labelled half: a one-line label over a frame. Its content (a
 * `ScaledBox`, or a notice) carries the painted width; the frame only outlines
 * and rounds it.
 *
 * The chrome is kept to what does not steal room from the rendering. The label
 * is ONE line (it truncates rather than wraps), so its height is a constant the
 * fit can subtract. The frame is a ring, not a padded card: a ring paints
 * outside the box and takes no layout, so the rendering's edge is the frame's.
 */
function Half({
  title,
  subtitle,
  halfRef,
  frameRef,
  children,
}: {
  title: string;
  subtitle?: string;
  /** The stage measures the mock half's label band off these two. */
  halfRef?: Ref<HTMLElement>;
  frameRef?: Ref<HTMLElement>;
  children: ReactNode;
}): ReactElement {
  return (
    <Stack ref={halfRef} gap="2xs">
      {/* `contain: inline-size` keeps the label out of the half's width: a long
          caption must truncate, not widen one half past its frame. */}
      <Line style={{ contain: "inline-size" }}>
        <Stack direction="row" gap="sm" align="baseline">
          <Text variant="label">{title}</Text>
          {subtitle !== undefined ? (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </Stack>
      </Line>
      <Clip ref={frameRef} className="rounded-md ring-1 ring-border">
        {children}
      </Clip>
    </Stack>
  );
}

/**
 * The width to start at: whichever is offered that is closest to the
 * prototype's own declared viewport width.
 *
 * The mock was drawn at that width, so it is the one width the mock is certain
 * to have something to say about — and the counterpart's own list is where its
 * meaningful breakpoints are stated. Ties go to the narrower.
 */
function defaultWidth(widths: WidthChoices, meta: PrototypeMeta): number {
  let best = widths[0];
  for (const w of widths) {
    if (Math.abs(w - meta.viewport.w) < Math.abs(best - meta.viewport.w)) {
      best = w;
    }
  }
  return best;
}
