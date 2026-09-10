import { useState, type ReactElement, type ReactNode } from "react";
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

/**
 * Widths to offer while the counterpart has none to offer — it is still
 * loading, or could not be resolved. The mock half still renders at a real
 * width in those states, so there is always a list to pick from.
 */
const PLACEHOLDER_WIDTHS: WidthChoices = [360, 640, 960];

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
              <Half title="Prototype mock" subtitle={meta.title} width={width}>
                {/* The prototype's declared viewport height: the frame is as tall
                    as the mock says it means to be, and as wide as the stage says. */}
                <MockFrame
                  meta={meta}
                  version={version}
                  height={meta.viewport.h}
                />
              </Half>
              <CounterpartHalf resolution={resolution} width={width} />
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
}: {
  resolution: CounterpartResolution;
  width: number;
}): ReactElement {
  switch (resolution.status) {
    case "loading":
      return (
        <Half title="Counterpart" width={width}>
          <Inset pad="lg">
            <Loading label={resolution.label ?? "Loading the counterpart…"} />
          </Inset>
        </Half>
      );
    case "unresolved":
      return (
        <Half title="Counterpart" width={width}>
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
        </Half>
      );
    case "found":
      return (
        <Half
          title={resolution.title}
          subtitle={resolution.subtitle}
          width={width}
        >
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
            {resolution.render(width)}
          </PluginErrorBoundary>
        </Half>
      );
  }
}

/** One labelled half, sized to the shared width. */
function Half({
  title,
  subtitle,
  width,
  children,
}: {
  title: string;
  subtitle?: string;
  width: number;
  children: ReactNode;
}): ReactElement {
  return (
    <Stack gap="2xs">
      <Stack direction="row" gap="sm" align="baseline" wrap>
        <Text variant="label">{title}</Text>
        {subtitle !== undefined ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </Stack>
      {/* Fixed-px width is the point here — both halves are handed the SAME box,
          which is the only way the two renderings are comparable at all. */}
      <Card style={{ width }}>{children}</Card>
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
