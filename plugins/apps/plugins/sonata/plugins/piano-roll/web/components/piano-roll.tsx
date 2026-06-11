import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  accidentalGlyph,
  bars,
  buildTempoIndex,
  makeKeySpeller,
  scoreEndBeat,
  type KeyLane,
  type Score,
  type TempoIndex,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useConfig } from "@plugins/config_v2/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useInertialDrag } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/inertial-drag/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import {
  useTrackColorMap,
  useHiddenTrackIds,
} from "@plugins/apps/plugins/sonata/plugins/track-mixer/web";
import { pianoRollConfig } from "../../shared/config";
import { buildProjection, isBlackPitch, PX_PER_SECOND } from "./geometry";
import { ProjectionProvider } from "./projection-context";
import { OverlayHost } from "./overlay-host";
import { PitchAxisHost } from "./pitch-axis-host";

/** Props the shell's `Sonata.Display.Dispatch` passes to the chosen display. */
export interface PianoRollProps {
  score: Score;
  cursorBeat: number;
  /** Playback tempo multiplier (1 = authored). Scales the scroll rate so slowing
   *  the tempo slows the scroll instead of stretching note heights. */
  tempoScale: number;
  activeDisplayId: string;
}

/** Height of the pitch-axis gutter (the piano keyboard) at the bottom. */
const KEYBOARD_HEIGHT = 112;

/**
 * Font size (px) for a falling-bar note name, sized so the whole label fits
 * *inside* the bar — no overflow into neighbouring columns. The width budget is
 * the label's intrinsic advance in em: one cap letter (≈0.70em in Inter
 * semibold) plus, when present, the compact accidental rendered at 0.7em and
 * tucked in (net ≈0.34em). Dividing the bar width by that budget makes a bare
 * natural on a wide white key large, while a flat/sharp on the narrower black
 * key (blackW ≈ 0.62·whiteW) plus its extra glyph comes out smaller — exactly
 * the desired "black-key names are smaller" behaviour. Capped by the bar height
 * so short notes don't get oversized text, and by a tasteful ceiling. Returns
 * null when even the legible floor won't fit, so the caller skips the label.
 */
function noteLabelFontPx(
  keyWidth: number,
  barHeight: number,
  hasAccidental: boolean,
): number | null {
  const FLOOR = 7;
  const LETTER_EM = 0.7;
  const ACCIDENTAL_EM = 0.34;
  const FILL = 0.94;
  const emWidth = LETTER_EM + (hasAccidental ? ACCIDENTAL_EM : 0);
  const widthFit = (keyWidth * FILL) / emWidth;
  if (widthFit < FLOOR) return null;
  return Math.max(FLOOR, Math.min(widthFit, barHeight * 0.85, 28));
}

/** Observe an element's pixel size via ResizeObserver (no polling). */
function useElementSize(): [
  React.RefObject<HTMLDivElement | null>,
  { width: number; height: number },
] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

/**
 * Bar lines, drawn as absolutely-positioned content-space elements. These live
 * INSIDE the scroll layer, so their `top` is the cursor-invariant content Y and
 * the layer's `translateY` scrolls them. All bars mount once — the lane's
 * `overflow-hidden` paint-culls whatever falls offscreen.
 */
function GridLines({
  score,
  beatToY,
  laneWidth,
}: {
  score: Score;
  beatToY: (beat: number) => number;
  laneWidth: number;
}) {
  const barList = useMemo(() => bars(score), [score]);

  return (
    <>
      {barList.map((b) => (
        <div
          key={b.index}
          className="absolute left-0 border-t border-border/60"
          style={{ top: beatToY(b.startBeat), width: laneWidth }}
        >
          <span className="absolute left-1 top-0.5 select-none text-3xs tabular-nums text-muted-foreground/70">
            {b.index + 1}
          </span>
        </div>
      ))}
    </>
  );
}

/**
 * Octave separators: vertical lines at every C boundary (the left edge of each C
 * key), so the eye can register which octave a falling note belongs to. Pitch is
 * the FIXED horizontal axis, so these are screen-anchored — they never scroll,
 * unlike the time-axis bar lines. Drawn full lane height from the published key
 * layout, so each line sits exactly on its key's left edge.
 */
function OctaveLines({
  keys,
  laneHeight,
}: {
  keys: readonly KeyLane[];
  laneHeight: number;
}) {
  const cKeys = useMemo(
    () => keys.filter((k) => ((k.pitch % 12) + 12) % 12 === 0),
    [keys],
  );

  return (
    <>
      {cKeys.map((k) => (
        <div
          key={k.pitch}
          className="pointer-events-none absolute top-0 border-l border-border/40"
          style={{ left: k.center - k.width / 2, height: laneHeight }}
        />
      ))}
    </>
  );
}

/**
 * The ONLY component that reads `cursorBeat` each frame. It maps the cursor to a
 * single scroll `offset` and applies it as one `translateY` over its children.
 *
 * Its `children` are the cursor-INVARIANT content (notes + bar lines + overlays),
 * created by the parent which does NOT depend on `cursorBeat`. Because those
 * element identities don't change between frames, React bails out re-rendering
 * them when only the cursor advances — so the whole notes/overlay subtree stops
 * reconciling and only this leaf's transform updates. Keeping the parent
 * cursor-free is load-bearing: if it read `cursorBeat`, the isolation breaks.
 *
 * `transform` opens a new stacking context here, so the now-line must remain a
 * sibling OUTSIDE this layer to render above it.
 */
function ScrollLayer({
  cursorBeat,
  laneHeight,
  tempo,
  tempoScale,
  children,
}: {
  cursorBeat: number;
  laneHeight: number;
  tempo: TempoIndex;
  tempoScale: number;
  children: React.ReactNode;
}) {
  // Map the cursor to the lane bottom: offset = height + seconds(cursor)*pxPerSec.
  // This is exactly the per-frame term factored out of the old screen-space
  // beatToY, applied once to the whole content layer. `pxPerSecond` mirrors the
  // geometry's `PX_PER_SECOND * tempoScale`, so a slower tempo scrolls slower.
  const offset =
    laneHeight + tempo.beatToSeconds(cursorBeat) * PX_PER_SECOND * tempoScale;
  return (
    <div
      className="absolute inset-0"
      style={{ transform: `translateY(${offset}px)` }}
    >
      {children}
    </div>
  );
}

function PianoRollInner({ score, cursorBeat, tempoScale }: PianoRollProps) {
  // We measure the LANE (above the keyboard); its height drives the time axis.
  const [laneRef, lane] = useElementSize();

  // Synthesia-style note-name labels (opt-in). Spelling follows the score's key
  // signature so accidentals read in-key (Eb vs D#), matching the keyboard below.
  const { showNoteNames } = useConfig(pianoRollConfig);
  const speller = useMemo(
    () => makeKeySpeller(score.meta.key),
    [score.meta.key],
  );

  // Cursor-invariant projection: depends only on lane size + score, so it (and
  // every note rect) stays stable while playing — only the ScrollLayer moves.
  const projection = useMemo(
    () =>
      buildProjection({
        width: lane.width,
        height: lane.height,
        score,
        tempoScale,
      }),
    [lane.width, lane.height, score, tempoScale],
  );

  // Tempo index, built once per score and reused by the ScrollLayer so it is
  // not rebuilt every frame (the projection already built its own internally).
  const tempo = useMemo(() => buildTempoIndex(score), [score]);

  // --- Drag-to-scrub with momentum: the lane behaves like a movable surface. --
  // Grabbing the roll and dragging maps pointer travel 1:1 onto the scroll
  // offset, so the content follows the finger: drag DOWN advances time (future
  // notes fall toward the now-line), drag UP rewinds. A flick on release coasts
  // under exponential friction and settles. We drive the shared absolute
  // `seekTo`, the same primitive the progression-bar scrubber uses, so audio +
  // cursor stay glued. The offset's time term is
  // `seconds(cursor) * PX_PER_SECOND * tempoScale`, so a 1-pixel drag equals
  // `1 / (PX_PER_SECOND * tempoScale)` authored-seconds of travel — hence
  // `unitsPerPixel`. The physics (friction, momentum) lives in the reusable
  // inertial-drag primitive; this site only maps pixels↔seconds and bridges the
  // transport (pause on grab, restore the pre-drag play state once motion ends).
  const { seekTo, isPlaying, play, stop } = useSonata();
  const hasNotes = score.notes.length > 0;
  const pxPerSecond = PX_PER_SECOND * tempoScale;
  const endSeconds = tempo.beatToSeconds(scoreEndBeat(score));
  const wasPlaying = useRef(false);

  const { handlers, phase } = useInertialDrag({
    axis: "y",
    unitsPerPixel: 1 / pxPerSecond,
    bounds: [0, endSeconds],
    origin: () => tempo.beatToSeconds(cursorBeat),
    onScrub: (sec) => seekTo(tempo.secondsToBeat(sec)),
    onGrab: () => {
      if (isPlaying) {
        wasPlaying.current = true;
        stop();
      }
    },
    onSettle: () => {
      if (wasPlaying.current) {
        wasPlaying.current = false;
        play();
      }
    },
  });

  // Per-track view-state: hidden tracks are dropped from the roll entirely;
  // every drawn note is tinted by its track's effective color (palette default
  // or user override). Both come from the track-mixer's reactive rollup, so a
  // toggle/recolor re-derives `noteRects` (and only then — not per frame).
  const colorMap = useTrackColorMap();
  const hiddenIds = useHiddenTrackIds();

  // Note rectangles, derived from the projection (single geometry source). The
  // key-signature-aware name is computed here too so it stays stable across
  // frames; the label only renders when `showNoteNames` is on.
  const noteRects = useMemo(() => {
    const toRect = projection.noteToRect!;
    return score.notes
      .filter((n) => !hiddenIds.has(n.track))
      .map((n) => {
        // Prefer the note's own populated spelling (from the key-context pass);
        // fall back to lazy key-aware spelling for any note left unspelled.
        const s = n.spelling ?? speller.spell(n.pitch);
        return {
          note: n,
          rect: toRect(n),
          // Step letter and accidental kept apart so the glyph can be rendered
          // compact + tucked against the letter (the unicode ♭/♯ carry a wide
          // left-bearing that otherwise wastes space and overflows the column).
          step: s.step,
          accidental: accidentalGlyph(s.alter),
          color: colorMap.get(n.track) ?? null,
          // Synthesia-style: notes landing on black keys (sharps/flats) read a
          // shade darker than the white-key notes of the same track, so the
          // accidental rows are visually distinct from the diatonic ones.
          isBlack: isBlackPitch(n.pitch),
        };
      });
  }, [projection, score.notes, speller, colorMap, hiddenIds]);

  // The cursor-invariant content. Built here (cursor-free) so its element
  // identity is stable across frames; passed as `children` to ScrollLayer.
  const content = (
    <>
      <GridLines
        score={score}
        beatToY={projection.beatToY!}
        laneWidth={lane.width}
      />

      {noteRects.map(({ note, rect, step, accidental, color, isBlack }) => {
        // Note name sized to fit inside the bar; null when it can't fit legibly.
        const fontPx = showNoteNames
          ? noteLabelFontPx(rect.w, rect.h, accidental !== "")
          : null;
        return (
        <div
          key={note.id}
          className="absolute z-raised"
          style={{
            left: rect.x,
            top: rect.y,
            width: Math.max(2, rect.w - 1),
            height: Math.max(2, rect.h - 1),
          }}
          title={`pitch ${note.pitch} · beat ${note.start.toFixed(2)}`}
        >
          {/* Color fill is its own layer so velocity-driven opacity (and the
              black-key brightness shade) dim the bar WITHOUT also fading the
              label sitting on top of it. */}
          <div
            className={cn(
              "absolute inset-0 rounded-sm border shadow-sm",
              // Fall back to the primary token only when no track color resolved
              // (e.g. before the rollup loads); otherwise tint per track.
              color ? null : "border-primary/40 bg-primary/70",
            )}
            style={{
              opacity: 0.4 + (note.velocity / 127) * 0.6,
              // Darken black-key notes one shade below their track color. Applied
              // as a luminance filter so it works for any color format and for
              // the token fallback alike, without parsing the color string.
              filter: isBlack ? "brightness(0.72)" : undefined,
              ...(color
                ? { backgroundColor: color, borderColor: color }
                : null),
            }}
          />
          {/* Synthesia-style name, anchored to the bar's leading (bottom) edge
              and centered. Sized by noteLabelFontPx to sit fully inside the bar
              (naturals large on wide white keys, accidentals smaller on narrow
              black keys). A dark halo (text-shadow) keeps the white glyph legible
              on every palette hue — including bright amber/lime/cyan and
              velocity-dimmed/black-key-darkened bars — without per-note luminance
              math, which the opacity blend toward the dark roll background would
              defeat anyway. */}
          {fontPx !== null ? (
            <span
              // eslint-disable-next-line text/no-adhoc-typography -- per-note glyph sized by inline fontSize (fontPx); tight leading is required to vertically center the note-name on the falling bar
              className="pointer-events-none absolute inset-x-0 bottom-0.5 select-none whitespace-nowrap text-center font-semibold leading-none text-white"
              style={{
                fontSize: fontPx,
                textShadow:
                  "0 1px 1.5px rgba(0,0,0,0.95), 0 0 1px rgba(0,0,0,0.9)",
              }}
            >
              {step}
              {accidental ? (
                // Compact accidental tucked tight against the letter: smaller
                // and pulled in to cancel the glyph's wide left-bearing, so the
                // pair stays near one column wide instead of overflowing.
                <span style={{ fontSize: "0.7em", marginLeft: "-0.12em" }}>
                  {accidental}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        );
      })}

      {/* Overlays anchor against the published projection. */}
      <ProjectionProvider projection={projection}>
        <OverlayHost score={score} />
      </ProjectionProvider>
    </>
  );

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* The note lane. Content lives in cursor-invariant content-space; the
          ScrollLayer applies the per-frame scroll as one translateY. Pitch is
          the fixed full keyboard across the width, so notes align
          column-for-key with the keyboard below. */}
      <div
        ref={laneRef}
        {...(hasNotes ? handlers : null)}
        className={cn(
          "relative min-h-0 flex-1 touch-none select-none overflow-hidden",
          hasNotes
            ? phase === "idle"
              ? "cursor-grab"
              : "cursor-grabbing"
            : null,
        )}
      >
        {/* Octave separators: screen-anchored vertical lines at each C boundary.
            Placed before the scroll layer in DOM so falling notes paint above
            the grid; outside it because pitch is the fixed horizontal axis. */}
        <OctaveLines keys={projection.keys ?? []} laneHeight={lane.height} />

        <ScrollLayer
          cursorBeat={cursorBeat}
          laneHeight={lane.height}
          tempo={tempo}
          tempoScale={tempoScale}
        >
          {content}
        </ScrollLayer>

        {/* Playback now-line: where falling notes land on the keyboard. Screen-
            anchored, so it sits OUTSIDE the scroll layer (and above it). */}
        <div
          className="pointer-events-none absolute left-0 z-raised h-0.5 bg-primary"
          style={{ top: lane.height, width: lane.width }}
        />

        {/* Empty-score affordance. */}
        {score.notes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Text as="span" variant="body" className="text-muted-foreground">
              No notes to display. Load a source to see the piano roll.
            </Text>
          </div>
        ) : null}
      </div>

      {/* Pitch-axis gutter: the piano keyboard (and any future pitch-axis
          decorations) contributed via `Sonata.PitchAxis`. */}
      <div
        className="relative shrink-0 border-t border-border"
        style={{ height: KEYBOARD_HEIGHT }}
      >
        <PitchAxisHost projection={projection} />
      </div>
    </div>
  );
}

/**
 * The piano-roll Display. Renders notes Synthesia-style on a time (vertical) ×
 * pitch (horizontal full-keyboard) grid that falls toward a piano keyboard at
 * the bottom. Publishes a `Projection` (both capabilities) and hosts capability-
 * compatible overlays (over the lane) and pitch-axis decorations (in the gutter).
 */
export function PianoRoll(props: PianoRollProps) {
  return <PianoRollInner {...props} />;
}
