import { collectKeyEntries } from "@plugins/apps/plugins/sonata/plugins/score/core";
import type {
  KeySignature,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { railBandClass } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";

/**
 * Key-signature markers along the progression bar.
 *
 * A song's tonal centre is meaning layered on top of the notes: the *starting*
 * key (`score.meta.key`) plus any mid-song key changes, which the IR models as
 * `type:"key"` annotations. `collectKeyEntries` reconciles both into a sorted
 * list of "key established at beat X" entries; here we mark each one with a
 * strong vertical bar at the boundary where the key takes hold — a highlighted
 * sibling of the muted bar ticks, drawn on the SAME shared rail band so the two
 * line up pixel-for-pixel — captioned by a small neutral chip naming the key,
 * floating in the headroom just above the rail. A song that moves through three
 * keys reads as three change bars at a glance, each labelled with its key.
 *
 * The change bar sits on the rail (via `railBandClass`); the chip floats above
 * it, leaving the rail itself clean. The section bands own the bottom headroom,
 * so chip / bar / bands stack without fighting for the same pixels.
 */

/** Compact label, e.g. `C maj` / `A min`. */
function keyLabel(key: KeySignature): string {
  return `${key.tonic} ${key.mode === "major" ? "maj" : "min"}`;
}

export function KeyFlags({
  score,
  beatToFraction,
}: {
  score: Score;
  /** beat → [0,1] position along the track. */
  beatToFraction: (beat: number) => number;
}) {
  const entries = collectKeyEntries(score);

  // Common case today: meta.key unset and no `key` annotations → render nothing
  // rather than an empty overlay artifact.
  if (entries.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {entries.map((e) => {
        const startF = beatToFraction(e.beat);
        return (
          <div
            key={`${e.beat}-${keyLabel(e.key)}`}
            className="absolute inset-y-0"
            style={{ left: `${startF * 100}%` }}
            title={keyLabel(e.key)}
          >
            {/* Strong vertical bar marking where this key takes hold — a
                highlighted sibling of the muted bar ticks, on the same shared
                rail band so the two align pixel-for-pixel. */}
            <div className={`${railBandClass} left-0 w-0.5 bg-foreground/60`} />
            {/* Small neutral key chip — names the key without a colored band,
                floating in the headroom just above the rail. */}
            {/* eslint-disable-next-line text/no-adhoc-typography, spacing/no-adhoc-spacing -- tight key chip: line-height must stay 1 so the marker stays slim, matching the bands below; mb-2 lifts the chip into the headroom above the rail (no named margin utility) */}
            <span className="absolute bottom-1/2 left-1 mb-2 whitespace-nowrap rounded-sm bg-muted px-xs text-3xs font-medium leading-none text-foreground/80">
              {keyLabel(e.key)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
