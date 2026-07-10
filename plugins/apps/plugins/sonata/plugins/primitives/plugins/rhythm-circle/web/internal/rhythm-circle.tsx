import {
  useImperativeHandle,
  useMemo,
  useRef,
  type KeyboardEvent,
  type Ref,
} from "react";
import {
  beadRadius,
  CENTER,
  point,
  pulseAngle,
  ringGap,
  ringRadius,
  R_OUTER,
  VIEWBOX,
} from "./geometry";

/** One concentric ring of the necklace. Speaks only plain numbers. */
export interface RhythmCircleTrack {
  /** Stable identity, echoed back through {@link RhythmCircleProps.onToggleOnset}. */
  id: string;
  /** Number of evenly-spaced beads (pulses) on this ring. */
  subdivisions: number;
  /** Already-EFFECTIVE onset indices — the caller applies any rotation. */
  onsets: readonly number[];
  /** CSS color for filled (onset) beads, e.g. `"var(--chart-1)"`. Default `var(--primary)`. */
  colorVar?: string;
  /** Optional human label, folded into each bead's `aria-label`. */
  label?: string;
}

/** Imperative facade — the ONLY way the playhead moves the needle. */
export interface RhythmCircleHandle {
  /** Position the needle at `phase` in `[0,1)` and light the swept onset beads. */
  setPhase(phase: number): void;
}

export interface RhythmCircleProps {
  /** Rings, outermost first. */
  tracks: readonly RhythmCircleTrack[];
  /** Controlled / static needle position in `[0,1)`. The imperative handle wins after mount. */
  phase?: number;
  /** Present ⇒ beads are interactive (toggle an onset). Absent ⇒ read-only. */
  onToggleOnset?: (trackId: string, index: number) => void;
  /** Square SVG side in px. */
  size?: number;
  /** Imperative handle for zero-render playhead-driven spins. */
  ref?: Ref<RhythmCircleHandle>;
}

/** Per-ring layout + live cursor state, rebuilt only when the track shape changes. */
interface RingModel {
  id: string;
  subdivisions: number;
  onsetSet: Set<number>;
  radius: number;
  beadR: number;
  /** Cached bead centres, one per pulse. */
  positions: [number, number][];
}

/**
 * Dynamic bead + needle styling lives in scoped CSS (SVG presentation
 * attributes, not Tailwind), so `setPhase` can toggle a `data-active` attribute
 * with zero React renders. The strike (a bright primary rim) lights ONLY an
 * onset bead swept by the needle — a rest under the needle stays quiet. The
 * needle itself is never CSS-transitioned (it's driven per frame), and the bead
 * transitions collapse under `prefers-reduced-motion`.
 */
const STYLE = `
.rc-bead { transition: opacity 140ms ease, stroke-width 140ms ease; }
.rc-bead[data-active="true"][data-onset="true"] {
  opacity: 1;
  stroke: var(--primary);
  stroke-width: 2.5;
}
.rc-bead-interactive { cursor: pointer; }
.rc-bead-interactive:hover { opacity: 0.8; }
@media (prefers-reduced-motion: reduce) { .rc-bead { transition: none; } }
`;

/** SVG transform that rotates a `<g>` by `deg` about the circle centre. */
function needleTransform(deg: number): string {
  return `rotate(${deg} ${CENTER} ${CENTER})`;
}

/**
 * A rotating rhythm necklace: one concentric ring per track, a bead per pulse
 * (index 0 at 12 o'clock, increasing clockwise), and a needle that sweeps the
 * playhead. Filled beads are onsets; a thin ring stroke threads each track's
 * beads.
 *
 * GENERIC BY CONSTRUCTION — it imports nothing from Sonata and speaks only plain
 * numbers, so it can drive a drum machine, a metronome, or any onset surface.
 *
 * Spin costs ZERO React renders: the consumer drives {@link RhythmCircleHandle.setPhase}
 * from its own transport clock (this primitive owns no rAF loop), and `setPhase`
 * imperatively writes the needle transform and flips the swept beads' `data-active`
 * off/on via cached element refs — O(tracks) per frame, no allocation.
 */
export function RhythmCircle({
  tracks,
  phase = 0,
  onToggleOnset,
  size = 220,
  ref,
}: RhythmCircleProps) {
  const needleRef = useRef<SVGGElement>(null);

  // The layout + the mutable per-frame caches. Rebuilt only when the track shape
  // (ids / subdivisions / onset sets) changes — NOT on every cursor frame — so
  // `setPhase` reads stable arrays and the bead <circle>s never remount mid-spin.
  const shapeKey = tracks
    .map((t) => `${t.id}:${t.subdivisions}:${t.onsets.join(",")}`)
    .join("|");
  const model = useMemo(() => {
    const count = tracks.length;
    const gap = ringGap(count);
    const rings: RingModel[] = tracks.map((t, ti) => {
      const radius = ringRadius(ti, count);
      const positions: [number, number][] = [];
      for (let i = 0; i < t.subdivisions; i++) {
        positions.push(point(CENTER, CENTER, radius, pulseAngle(i, t.subdivisions)));
      }
      return {
        id: t.id,
        subdivisions: t.subdivisions,
        onsetSet: new Set(t.onsets),
        radius,
        beadR: beadRadius(radius, t.subdivisions, gap),
        positions,
      };
    });
    // Cached bead elements + the currently-lit index per ring (−1 = none).
    const beads: (SVGCircleElement | null)[][] = rings.map((r) =>
      new Array<SVGCircleElement | null>(r.subdivisions).fill(null),
    );
    const active: number[] = rings.map(() => -1);
    return { rings, beads, active };
    // Keyed on the derived shape signature: identical shapes reuse the caches
    // across cursor frames, so bead refs stay attached and setPhase never allocates.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shapeKey is the value-signature of `tracks`; depending on the array identity would rebuild every frame and detach the bead refs.
  }, [shapeKey]);

  useImperativeHandle(
    ref,
    (): RhythmCircleHandle => ({
      setPhase(p: number) {
        const g = needleRef.current;
        if (g) g.setAttribute("transform", needleTransform(p * 360));
        for (let ti = 0; ti < model.rings.length; ti++) {
          const ring = model.rings[ti]!;
          if (ring.subdivisions <= 0) continue;
          const next = Math.floor(p * ring.subdivisions) % ring.subdivisions;
          const prev = model.active[ti]!;
          if (prev === next) continue;
          const row = model.beads[ti]!;
          if (prev >= 0) row[prev]?.removeAttribute("data-active");
          row[next]?.setAttribute("data-active", "true");
          model.active[ti] = next;
        }
      },
    }),
    [model],
  );

  const interactive = !!onToggleOnset;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      width={size}
      height={size}
      role={interactive ? "group" : "img"}
      aria-label="Rhythm circle"
      className="block"
    >
      <style>{STYLE}</style>

      {model.rings.map((ring, ti) => {
        const track = tracks[ti]!;
        const color = track.colorVar ?? "var(--primary)";
        return (
          <g key={ring.id}>
            {/* Faint ring stroke threading this track's beads. */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={ring.radius}
              fill="none"
              stroke="var(--border)"
              strokeWidth={0.75}
            />
            {ring.positions.map(([bx, by], i) => {
              const onset = ring.onsetSet.has(i);
              return (
                <circle
                  key={i}
                  ref={(el) => {
                    model.beads[ti]![i] = el;
                  }}
                  cx={bx}
                  cy={by}
                  r={ring.beadR}
                  data-onset={onset ? "true" : "false"}
                  fill={onset ? color : "var(--muted)"}
                  stroke={onset ? "none" : "var(--border)"}
                  strokeWidth={onset ? 0 : 0.75}
                  className={interactive ? "rc-bead rc-bead-interactive" : "rc-bead"}
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={
                    interactive
                      ? `${track.label ?? track.id} pulse ${i + 1}: ${onset ? "on" : "off"}`
                      : undefined
                  }
                  onClick={
                    interactive ? () => onToggleOnset(track.id, i) : undefined
                  }
                  onKeyDown={
                    interactive
                      ? (e: KeyboardEvent<SVGCircleElement>) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggleOnset(track.id, i);
                          }
                        }
                      : undefined
                  }
                />
              );
            })}
          </g>
        );
      })}

      {/* The needle. Rotated about the circle centre via the SVG transform
          attribute (explicit centre — never the bounding-box origin), so
          setPhase's setAttribute and this initial render agree exactly. */}
      <g ref={needleRef} transform={needleTransform(phase * 360)}>
        <line
          x1={CENTER}
          y1={CENTER}
          x2={CENTER}
          y2={CENTER - R_OUTER - 5}
          stroke="var(--primary)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </g>
      <circle cx={CENTER} cy={CENTER} r={2.5} fill="var(--primary)" />
    </svg>
  );
}
