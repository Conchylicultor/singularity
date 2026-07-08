import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import {
  useCursorApi,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  scoreEndBeat,
  buildTempoIndex,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SonataProgress } from "../slots";
import { RAIL_THICKNESS } from "../rail-geometry";

/**
 * Format elapsed seconds as `m:ss.s` (e.g. 95.4 → "1:35.4"). Rounds to tenths
 * first so a value like 119.98s renders "2:00.0" rather than rolling over into
 * an illegal "1:60.0".
 */
function formatTime(seconds: number): string {
  const tenths = Math.max(0, Math.round(seconds * 10));
  const totalSec = Math.floor(tenths / 10);
  const minutes = Math.floor(totalSec / 60);
  const secs = totalSec - minutes * 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}.${tenths % 10}`;
}

/**
 * The Sonata Transport progression bar: a full-width horizontal scrubber over
 * the whole song `[0, endBeat]`. Reads the shared cursor and drives the
 * absolute `seekTo` primitive on click/drag. Hosts the open
 * `SonataProgress.Marker` slot as a pointer-transparent overlay so contributed
 * markers (bar ticks, section bands, …) layer on without intercepting seeks.
 *
 * The playhead, the fill, the elapsed-time readout, and the ARIA value all
 * change every frame during playback. Rather than re-render this whole subtree
 * ~60×/sec (a per-frame React commit that the render-loop detector flags as a
 * `subtree-cascade` of wasted DOM thrash, since each commit re-mutates the
 * fill `width`, the playhead `left`, the time text and `aria-valuenow`), it
 * subscribes to the cursor IMPERATIVELY — exactly like the piano-roll's
 * `applyCursor` — and paints via refs with ZERO React renders:
 *  - fill / playhead move via `transform` (`scaleX` / `translateX`), which the
 *    GPU composites and the render-loop detector skips as animation-driven;
 *  - the time readout is written through `textContent` (a characterData write,
 *    which the detector's MutationObserver does not watch);
 *  - `aria-valuenow` is updated only when its rounded value actually changes.
 * So during playback this bar emits no per-frame React work and no counted DOM
 * mutations, leaving the context value identity-stable for every other reader.
 */
export function ProgressBar() {
  const { score, seekTo } = useSonata();
  // Imperative cursor facade — read the live beat in the subscription, never a
  // per-frame React render (see the component doc-comment).
  const cursor = useCursorApi();
  const markers = SonataProgress.Marker.useContributions();

  const endBeat = scoreEndBeat(score);
  const ready = endBeat > 0;

  // beat → elapsed wall-clock seconds. The `score` from useSonata() already has
  // the playback speed (tempoScale) folded into its tempo map, so this readout
  // is a real stopwatch: at 50% speed the elapsed/total times stretch to match.
  const tempo = useMemo(() => buildTempoIndex(score), [score]);

  // beat → [0,1] along the track; the single projector shared by the playhead,
  // the filled portion, and every contributed marker.
  const beatToFraction = useCallback(
    (b: number) => (endBeat > 0 ? Math.max(0, Math.min(1, b / endBeat)) : 0),
    [endBeat],
  );

  // Imperative paint targets — the cursor subscription writes these directly.
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);

  const totalText = useMemo(
    () => (ready ? formatTime(tempo.beatToSeconds(endBeat)) : "—"),
    [ready, tempo, endBeat],
  );

  // Subscribe to the cursor and paint the playhead, fill, readout, and ARIA
  // value imperatively — no React render per frame. Re-armed whenever the
  // score-derived projectors change (new song / tempo). The store reports
  // seeks, but a scrubber paints identically for a smooth advance or a jump.
  useEffect(() => {
    const slider = sliderRef.current;
    let lastAria = NaN;
    const paint = () => {
      const beat = cursor.getBeat();
      const fraction = beatToFraction(beat);
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${fraction})`;
      }
      if (handleRef.current) {
        handleRef.current.style.transform = `translateX(${fraction * 100}%)`;
      }
      if (timeRef.current) {
        const text = ready
          ? `${formatTime(tempo.beatToSeconds(beat))} / ${totalText}`
          : "—";
        // Update the EXISTING text node's data (a characterData write the
        // render-loop detector does not observe) rather than `textContent`,
        // which swaps the node and would register a per-frame childList
        // mutation — the aggregate cascade tier counts those at a 6/s floor.
        const node = timeRef.current.firstChild;
        if (node && node.nodeType === Node.TEXT_NODE) {
          node.nodeValue = text;
        } else {
          timeRef.current.textContent = text;
        }
      }
      // aria-valuenow only needs to track the position coarsely for assistive
      // tech; updating it every frame is a per-frame attribute mutation for no
      // benefit, so write it only when its rounded value changes.
      if (slider) {
        // Clamp to the slider's declared domain `[0, endBeat]` — the lead-in
        // pre-roll sits at negative beats where the handle visually pins to the
        // left edge (see `beatToFraction`), so the ARIA value tracks the shown
        // position and never drops below `aria-valuemin={0}`.
        const rounded = Math.round(Math.max(0, Math.min(endBeat, beat)));
        if (rounded !== lastAria) {
          lastAria = rounded;
          slider.setAttribute("aria-valuenow", String(rounded));
        }
      }
    };
    paint();
    return cursor.subscribe(paint);
  }, [cursor, beatToFraction, tempo, ready, totalText, endBeat]);

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

  return (
    <Stack
      direction="row"
      align="center"
      gap="md"
      className="border-b border-border px-xl py-md"
    >
      {/* Interactive track. Extra vertical height (py) reserves headroom above
          and below for markers; the track itself is centered within it. */}
      <div
        ref={sliderRef}
        role="slider"
        aria-label="Song position"
        aria-valuemin={0}
        aria-valuemax={ready ? endBeat : 0}
        aria-valuenow={0}
        onPointerDown={ready ? onPointerDown : undefined}
        onPointerMove={ready ? onPointerMove : undefined}
        // eslint-disable-next-line layout/no-adhoc-layout -- flexible track fills the row; a role="slider" positioning context with pointer handlers has no primitive home
        className={
          "relative flex-1 py-md" + (ready ? " cursor-pointer" : "")
        }
      >
        {/* Layering (bottom → top): the rail track + fill are the background
            bar, the marker layer is the annotation stratum painted *on* the
            bar, and the playhead handle is the foreground knob. This z-order
            (rail → markers → handle) is why bar ticks must live in the marker
            layer rather than overhang the rail: they read as notches on the
            bar's surface, with the handle still sitting readably on top. */}

        {/* The track rail, centered within the region. Its thickness is the
            single source the on-rail markers (ticks, key bars) align to.
            `overflow-hidden` clips the scaleX-driven fill so its right edge
            keeps the rail's rounded cap without per-frame width mutations. */}
        {/* eslint-disable-next-line layout/no-adhoc-layout -- the rail clips its scaleX-driven fill so the fill keeps the rail's rounded cap without a per-frame width mutation */}
        <div className={`relative overflow-hidden ${RAIL_THICKNESS} rounded-full bg-muted`}>
          {/* Filled portion up to the playhead. Driven by `transform: scaleX`
              from the cursor subscription (origin-left), so the playback
              advance composites on the GPU and emits no counted DOM mutation. */}
          <div
            ref={fillRef}
            // eslint-disable-next-line layout/no-adhoc-layout -- JS-driven fill: scaleX from the cursor fraction, anchored to the rail's left edge
            className="absolute inset-0 origin-left bg-primary"
            style={{ transform: "scaleX(0)" }}
          />
        </div>

        {/* Marker layer — spans the full region (not just the rail) so markers
            have vertical headroom for labels/bands above and below the track.
            Painted above the rail so on-rail markers (bar ticks) are visible;
            pointer-transparent so clicks fall through to the seek track; each
            marker anchors itself horizontally via `beatToFraction`. */}
        {/* eslint-disable-next-line layout/no-adhoc-layout -- decorative coordinate-driven marker layer hosting fraction-positioned contributed markers */}
        <div className="pointer-events-none absolute inset-0">
          {markers.map((m) =>
            renderIsolated("sonata.progress.marker", m as unknown as Contribution, {
              score,
              beatToFraction,
            }),
          )}
        </div>

        {/* Playhead handle — foreground, above both rail and markers. A
            full-bleed layer driven by `transform: translateX(<fraction>%)` from
            the cursor subscription (% is relative to the full-width layer, so it
            tracks the track), with the knob pinned at the layer's left edge and
            self-centered. transform keeps the advance off the React/DOM-mutation
            path. */}
        {ready ? (
          <div
            ref={handleRef}
            // eslint-disable-next-line layout/no-adhoc-layout -- JS-driven playhead carrier: translateX from the cursor fraction across the full-width track
            className="pointer-events-none absolute inset-0"
            style={{ transform: "translateX(0)" }}
          >
            {/* eslint-disable-next-line layout/no-adhoc-layout -- playhead knob pinned at the carrier's left edge and self-centered; the carrier's translateX places it along the track */}
            <div className="absolute left-0 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow" />
          </div>
        ) : null}
      </div>

      {/* Minimal elapsed / total time readout (m:ss.s). The current time is
          written through `textContent` by the cursor subscription (a
          characterData write the render-loop detector does not observe), so the
          readout updates every frame without a React commit. */}
      {/* eslint-disable-next-line layout/no-adhoc-layout -- rigid time readout: never shrinks in the flex row beside the flexible track */}
      <Text variant="caption" tone="muted" className="shrink-0 tabular-nums">
        <span ref={timeRef}>{ready ? `0:00.0 / ${totalText}` : "—"}</span>
      </Text>
    </Stack>
  );
}
