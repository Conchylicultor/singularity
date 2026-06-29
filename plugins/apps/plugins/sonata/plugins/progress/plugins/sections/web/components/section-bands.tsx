import { MdRepeat } from "react-icons/md";
import type {
  Score,
  SectionAnnotation,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  cn,
  ControlSizeProvider,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";

/**
 * Section-region marker. The Score's `section` annotations carry the song's
 * coarse structure (intro, verse, chorus, …); here we lay each one out as a
 * translucent band spanning its beat range along the progression bar, so the
 * whole form reads at a glance under the playhead.
 *
 * We anchor purely off the scrubber's `beatToFraction` projector — the same
 * [0,1] mapping the playhead uses — so a band lines up exactly with where its
 * section plays. The bands are deliberately faint and live in the lower strip
 * of the marker layer: they're *background context*, never foreground. The
 * bar's ticks and the playhead must stay readable on top, hence the low-alpha
 * tints and `pointer-events-none`.
 */

// Cycle the themeable categorical palette (the same data-viz tokens Gantt phases
// and model-tier chips use) at low alpha, so adjacent sections stay
// distinguishable without any one band shouting over the playhead — and the
// tints re-skin with the active theme rather than being hardcoded scales.
const PALETTE = [
  "bg-categorical-1/15",
  "bg-categorical-2/15",
  "bg-categorical-3/15",
  "bg-categorical-4/15",
];

export function SectionBands({
  score,
  beatToFraction,
}: {
  score: Score;
  beatToFraction: (beat: number) => number;
}) {
  // The quick-loop affordance drives the shared A–B loop straight onto a section.
  const { setLoop, seekTo } = useSonata();

  // Narrow to the section annotations — they're the only structure we draw.
  const sections = score.annotations.filter(
    (a): a is SectionAnnotation => a.type === "section",
  );

  // Nothing to anchor to: stay invisible rather than render an empty strip.
  if (sections.length === 0) return null;

  return (
    // The strip stays pointer-transparent so the rail seeks underneath; each
    // band re-enables pointer events (pointer-events-auto) only for its own box,
    // so hovering it reveals its loop button and a click still bubbles to seek.
    // eslint-disable-next-line layout/no-adhoc-layout -- decorative coordinate-driven section-band strip hosting JS fraction-positioned bands
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2">
      {sections.map((a, idx) => {
        const left = beatToFraction(a.start);
        const width = beatToFraction(a.end) - beatToFraction(a.start);
        return (
          <div
            key={`${a.start}-${a.end}-${a.data.name}-${idx}`}
            // eslint-disable-next-line layout/no-adhoc-layout -- JS fraction-positioned band (left/width from beatToFraction); flex/items-center/overflow-hidden vertically center + clip the label inside the coordinate-driven box
            className={cn(
              "pointer-events-auto absolute inset-y-0 flex items-center overflow-hidden whitespace-nowrap rounded-sm px-xs",
              hoverRevealGroup,
              PALETTE[idx % PALETTE.length],
            )}
            style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
            title={a.data.name}
          >
            <SingleLineProvider value={true}>
              {/* eslint-disable-next-line text/no-adhoc-typography -- tight chip label: line-height must stay 1 so the band stays slim */}
              <Text className="text-3xs leading-none text-foreground/70">
                {a.data.name}
              </Text>
            </SingleLineProvider>
            {/* Hover-revealed quick-loop: set the shared A–B loop to this section
                and seek to its start. stopPropagation keeps the click from also
                seeking via the rail underneath. */}
            <div
              // eslint-disable-next-line layout/no-adhoc-layout -- loop button pinned to the band's right edge
              className={cn(
                "absolute right-0 top-1/2 -translate-y-1/2",
                hoverRevealTarget,
              )}
            >
              <ControlSizeProvider size="xs">
                <IconButton
                  icon={MdRepeat}
                  label="Loop this section"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setLoop({ start: a.start, end: a.end, enabled: true });
                    seekTo(a.start);
                  }}
                />
              </ControlSizeProvider>
            </div>
          </div>
        );
      })}
    </div>
  );
}
