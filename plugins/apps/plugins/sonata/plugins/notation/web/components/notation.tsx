import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  scoreEndBeat,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useConfig } from "@plugins/config_v2/web";
import {
  Sonata,
  useCursorApi,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useDarkMode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { useElementSize } from "@plugins/primitives/plugins/element-size/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { convert } from "../internal/convert";
import {
  engrave,
  type BeatAnchor,
  type EngraveResult,
} from "./engrave";
import { notationConfig } from "../../shared/config";

/** Props the shell's `Sonata.Display.Dispatch` passes to the chosen display. The
 *  playback cursor is NOT a prop — it's read imperatively (playhead/highlight,
 *  zero re-render) and via `useCursorSelector` (auto-scroll, per-system). */
export interface NotationProps {
  score: Score;
  tempoScale: number;
  activeDisplayId: string;
}

const EPS = 1e-6;

/** Active-note highlight + playhead accent, driven by CSS so it re-skins by theme.
 *  CSS beats SVG presentation attributes, so this recolors the engraved fills. */
const HIGHLIGHT_CSS = `
.notation-surface .vf-note.is-active,
.notation-surface .vf-note.is-active * {
  fill: var(--primary);
  stroke: var(--primary);
}`;

/** Largest anchor with `beat <= cursor`, plus the next anchor — for interpolation. */
function locate(
  anchors: BeatAnchor[],
  beat: number,
): { lo: BeatAnchor; hi: BeatAnchor | null } | null {
  if (anchors.length === 0) return null;
  let lo = 0;
  let hi = anchors.length - 1;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid]!.beat <= beat + EPS) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { lo: anchors[idx]!, hi: anchors[idx + 1] ?? null };
}

function NotationInner({ score }: NotationProps) {
  const { showChordSymbols, splitPitch } = useConfig(notationConfig);
  const { seekTo, isPlaying } = useSonata();
  const cursor = useCursorApi();
  const isDark = useDarkMode();

  const [sizeRef, size] = useElementSize<HTMLDivElement>();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);

  const resultRef = useRef<EngraveResult | null>(null);
  const activeElsRef = useRef<SVGElement[]>([]);
  // Last system the playhead auto-scrolled to — so we scroll only on a system
  // boundary, not every frame. Play-state read via a ref so applyCursor stays
  // identity-stable (never re-attaches the per-frame subscription).
  const lastScrolledSystemRef = useRef(-1);
  const isPlayingRef = useLatestRef(isPlaying);

  const model = useMemo(
    () => convert(score, { splitPitch, showChordSymbols }),
    [score, splitPitch, showChordSymbols],
  );
  const endBeat = useMemo(() => scoreEndBeat(score), [score]);
  const hasNotes = score.notes.length > 0;

  // Imperative per-frame cursor application — playhead position + note highlight,
  // ZERO React renders. Reads the latest engrave result + cursor from refs.
  const applyCursor = useCallback((beat: number) => {
    const result = resultRef.current;
    const playhead = playheadRef.current;
    if (!result || !playhead) return;

    const found = locate(result.anchors, beat);
    if (!found) {
      playhead.style.display = "none";
      return;
    }
    const { lo, hi } = found;
    let x = lo.x;
    if (hi && hi.systemIndex === lo.systemIndex && hi.beat > lo.beat) {
      x = lo.x + ((hi.x - lo.x) * (beat - lo.beat)) / (hi.beat - lo.beat);
    }
    const box = result.systems[lo.systemIndex];
    if (!box) {
      playhead.style.display = "none";
      return;
    }
    playhead.style.display = "block";
    playhead.style.height = `${box.height}px`;
    playhead.style.transform = `translate(${x}px, ${box.top}px)`;

    // Auto-scroll the active system to center — only on a system boundary, and
    // only while playing so a paused reader can scroll and browse freely.
    if (lo.systemIndex !== lastScrolledSystemRef.current) {
      lastScrolledSystemRef.current = lo.systemIndex;
      const scroll = scrollRef.current;
      if (isPlayingRef.current && scroll) {
        scroll.scrollTo({
          top: box.top - scroll.clientHeight / 2 + box.height / 2,
          behavior: "smooth",
        });
      }
    }

    // Highlight: clear the previous active set, light up notes sounding now.
    for (const el of activeElsRef.current) el.classList.remove("is-active");
    const next: SVGElement[] = [];
    for (const n of result.notes) {
      if (n.beat <= beat + EPS && n.end > beat + EPS) {
        n.el.classList.add("is-active");
        next.push(n.el);
      }
    }
    activeElsRef.current = next;
  }, []);

  // Engrave (DOM side-effect) on score / width / theme change. LayoutEffect so
  // the staff is painted before the browser shows the frame (no flash).
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!hasNotes || size.width <= 0) {
      host.innerHTML = "";
      resultRef.current = null;
      return;
    }
    const cs = getComputedStyle(host);
    const colors = {
      foreground: cs.getPropertyValue("--foreground").trim() || "currentColor",
      primary: cs.getPropertyValue("--primary").trim() || "currentColor",
    };
    resultRef.current = engrave(host, model, size.width, endBeat, colors);
    activeElsRef.current = [];
    applyCursor(cursor.getBeat());
  }, [model, size.width, isDark, endBeat, hasNotes, cursor, applyCursor]);

  // Drive the imperative path on every cursor change — no React render.
  useEffect(
    () => cursor.subscribe(() => applyCursor(cursor.getBeat())),
    [cursor, applyCursor],
  );

  // Click a notehead to seek the transport to its beat.
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as Element;
      const noteEl = target.closest<SVGElement>(".vf-note");
      const beat = noteEl?.dataset.beat;
      if (beat !== undefined) seekTo(Number(beat));
    },
    [seekTo],
  );

  if (!hasNotes) {
    return (
      <Center className="h-full w-full bg-background">
        <Placeholder>No notes to display as notation.</Placeholder>
      </Center>
    );
  }

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- positioning context for the corner-pinned HUD over the scroll body
    <div className="notation-surface relative h-full w-full bg-background">
      <style>{HIGHLIGHT_CSS}</style>
      <Scroll axis="y" className="h-full" ref={scrollRef}>
        <Inset pad="md">
          {/* Positioning context for the playhead, sized to the engraved SVG. */}
          {/* eslint-disable-next-line layout/no-adhoc-layout -- relative anchor for the absolutely-positioned playhead overlaying the SVG host */}
          <div ref={sizeRef} className="relative" onClick={onClick}>
            <div ref={hostRef} />
            <div
              ref={playheadRef}
              // eslint-disable-next-line layout/no-adhoc-layout -- playhead line positioned imperatively (transform/height written per frame by applyCursor)
              className="pointer-events-none absolute left-0 top-0 z-raised w-0.5 bg-primary/70"
              style={{ display: "none" }}
            />
          </div>
        </Inset>
      </Scroll>

      {/* HUD: screen-anchored chips (current key, …) pinned to the top-right
          corner. Collection-consumer clean — renders the generic Sonata.Hud
          slot, never naming a contributor. */}
      <Pin to="top-right" offset="sm" layer="float" decorative>
        <Stack gap="xs" align="end">
          <Sonata.Hud.Render>
            {(h) => <h.component key={h.id} />}
          </Sonata.Hud.Render>
        </Stack>
      </Pin>
    </div>
  );
}

/**
 * The notation Display. Engraves the score as a grand staff (treble + bass) via
 * VexFlow — clefs, key/time signatures, barlines, accidentals, rests, ties — and
 * follows playback with a moving playhead, active-note highlight, and per-system
 * auto-scroll. A reading view: no projection, no capabilities; click a note to
 * seek the transport.
 */
export function Notation(props: NotationProps) {
  return <NotationInner {...props} />;
}
