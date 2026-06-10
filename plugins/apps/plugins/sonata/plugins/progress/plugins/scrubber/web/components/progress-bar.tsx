import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback } from "react";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { scoreEndBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Text } from "@plugins/primitives/plugins/text/web";
import { SonataProgress } from "../slots";

/**
 * The Sonata Transport progression bar: a full-width horizontal scrubber over
 * the whole song `[0, endBeat]`. Reads the shared cursor and drives the
 * absolute `seekTo` primitive on click/drag. Hosts the open
 * `SonataProgress.Marker` slot as a pointer-transparent overlay so contributed
 * markers (bar ticks, section bands, …) layer on without intercepting seeks.
 */
export function ProgressBar() {
  const { score, cursorBeat, seekTo } = useSonata();
  const markers = SonataProgress.Marker.useContributions();

  const endBeat = scoreEndBeat(score);
  const ready = endBeat > 0;

  // beat → [0,1] along the track; the single projector shared by the playhead,
  // the filled portion, and every contributed marker.
  const beatToFraction = useCallback(
    (b: number) => (endBeat > 0 ? Math.max(0, Math.min(1, b / endBeat)) : 0),
    [endBeat],
  );

  // Map a pointer's clientX to a beat and seek there. Used by both press and
  // drag so the math lives in exactly one place.
  const seekToPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (endBeat <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const f = (e.clientX - rect.left) / rect.width;
      seekTo(Math.max(0, Math.min(1, f)) * endBeat);
    },
    [endBeat, seekTo],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!ready) return;
      // Capture so the drag keeps tracking even if the pointer leaves the bar.
      e.currentTarget.setPointerCapture(e.pointerId);
      seekToPointer(e);
    },
    [ready, seekToPointer],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Primary button held → continuous drag-scrub.
      if (!ready || (e.buttons & 1) === 0) return;
      seekToPointer(e);
    },
    [ready, seekToPointer],
  );

  const filledPct = beatToFraction(cursorBeat) * 100;

  return (
    <div className="flex items-center gap-3 border-b border-border px-6 py-3">
      {/* Interactive track. Extra vertical height (py) reserves headroom above
          and below for markers; the track itself is centered within it. */}
      <div
        role="slider"
        aria-label="Song position"
        aria-valuemin={0}
        aria-valuemax={ready ? endBeat : 0}
        aria-valuenow={cursorBeat}
        onPointerDown={ready ? onPointerDown : undefined}
        onPointerMove={ready ? onPointerMove : undefined}
        className={
          "relative flex-1 py-3.5" + (ready ? " cursor-pointer" : "")
        }
      >
        {/* Layering (bottom → top): the rail track + fill are the background
            bar, the marker layer is the annotation stratum painted *on* the
            bar, and the playhead handle is the foreground knob. This z-order
            (rail → markers → handle) is why bar ticks must live in the marker
            layer rather than overhang the rail: they read as notches on the
            bar's surface, with the handle still sitting readably on top. */}

        {/* The track rail, centered within the region. */}
        <div className="relative h-2.5 rounded-full bg-muted">
          {/* Filled portion up to the playhead. */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${filledPct}%` }}
          />
        </div>

        {/* Marker layer — spans the full region (not just the rail) so markers
            have vertical headroom for labels/bands above and below the track.
            Painted above the rail so on-rail markers (bar ticks) are visible;
            pointer-transparent so clicks fall through to the seek track; each
            marker anchors itself horizontally via `beatToFraction`. */}
        <div className="pointer-events-none absolute inset-0">
          {markers.map((m) =>
            renderIsolated("sonata.progress.marker", m as unknown as Contribution, {
              score,
              beatToFraction,
            }),
          )}
        </div>

        {/* Playhead handle — foreground, above both rail and markers. Centered
            on the rail (the rail is vertically centered in the region, so the
            region's mid-line is the rail's). */}
        {ready ? (
          <div
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow"
            style={{ left: `${filledPct}%` }}
          />
        ) : null}
      </div>

      {/* Minimal cursor / end readout. */}
      <Text variant="caption" tone="muted" className="shrink-0 tabular-nums">
        {ready ? (
          <>
            {cursorBeat.toFixed(1)} / {endBeat.toFixed(1)}
          </>
        ) : (
          "—"
        )}
      </Text>
    </div>
  );
}
