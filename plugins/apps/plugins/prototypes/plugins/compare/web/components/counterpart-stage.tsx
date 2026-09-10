import { useState, type ReactElement, type ReactNode } from "react";
import { useElementSize } from "@plugins/primitives/plugins/dom/plugins/element-size/web";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
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
import { ScaledBox, boxStyle } from "./scaled-box";

/**
 * Widths to offer while the counterpart has none to offer — it is still
 * loading, or could not be resolved. The mock half still renders at a real
 * width in those states, so there is always a list to pick from.
 */
const PLACEHOLDER_WIDTHS: WidthChoices = [360, 640, 960];

/**
 * How the pair is painted. `fit` zooms both halves out by one factor until the
 * pair fits the pane's width (never zooming in); `actual` paints them at 100%
 * and lets the stage scroll. Zoom never changes the width they are LAID OUT at.
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
  // ONE scale for both halves, read off the mock half's box — it renders in
  // every arm, so there is always a box to read. Under Fit that box is the
  // shared width capped to the room its half has, so the ratio is the zoom that
  // fits; before the first measure (same commit, before paint) it is 1.
  const [mockBoxRef, { width: mockBoxWidth }] =
    useElementSize<HTMLDivElement>();
  const scale = fit && mockBoxWidth > 0 ? Math.min(1, mockBoxWidth / width) : 1;

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
                    "Zoom both halves out together until the pair fits the pane",
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
          <Inset pad="lg">
            <Stack direction="row" gap="lg" align="start">
              <Half title="Prototype mock" subtitle={meta.title}>
                <ScaledBox
                  width={width}
                  scale={scale}
                  fit={fit}
                  boxRef={mockBoxRef}
                >
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
                fit={fit}
              />
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
  fit,
}: {
  resolution: CounterpartResolution;
  width: number;
  scale: number;
  fit: boolean;
}): ReactElement {
  // A notice is prose, not a rendering to compare: it takes the half's box so
  // the two halves stay the same size, but reflows inside it instead of zooming.
  switch (resolution.status) {
    case "loading":
      return (
        <Half title="Counterpart">
          <Inset pad="lg" style={boxStyle(width, fit)}>
            <Loading label={resolution.label ?? "Loading the counterpart…"} />
          </Inset>
        </Half>
      );
    case "unresolved":
      return (
        <Half title="Counterpart">
          <Inset pad="lg" style={boxStyle(width, fit)}>
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
            <ScaledBox width={width} scale={scale} fit={fit}>
              {resolution.render(width)}
            </ScaledBox>
          </PluginErrorBoundary>
        </Half>
      );
  }
}

/**
 * One labelled half. Its content (a `ScaledBox`, or a notice in `boxStyle`)
 * carries the shared width; the card only wraps it.
 */
function Half({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}): ReactElement {
  return (
    // `minWidth: 0` lets Fit shrink the half below its content's width. Both
    // halves have the same flex basis (the shared width plus the same card
    // chrome), so they shrink by the same amount and keep one box size.
    <Stack gap="2xs" style={{ minWidth: 0 }}>
      {/* `contain: inline-size` keeps the label out of the half's basis: a long
          caption must wrap, not widen one half and break the symmetry. */}
      <Stack
        direction="row"
        gap="sm"
        align="baseline"
        wrap
        style={{ contain: "inline-size" }}
      >
        <Text variant="label">{title}</Text>
        {subtitle !== undefined ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </Stack>
      <Card>{children}</Card>
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
