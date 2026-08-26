import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import { collectKeyEntries } from "@plugins/apps/plugins/sonata/plugins/score/core";
import type {
  KeySignature,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { RAIL_BAND_Y } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
import {
  pct,
  Placed,
} from "@plugins/primitives/plugins/css/plugins/coords/web";

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
 * The change bar sits on the rail (via `RAIL_BAND_Y`); the chip floats above
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
    <Layer decorative>
      {entries.map((e) => (
        // The flag's own coordinate host, at the beat's fraction along the rail.
        <Placed
          key={`${e.beat}-${keyLabel(e.key)}`}
          x={{ start: pct(beatToFraction(e.beat)) }}
          y="fill"
          title={keyLabel(e.key)}
        >
          {/* Strong vertical bar marking where this key takes hold — a
              highlighted sibling of the muted bar ticks, taking the same shared
              rail-band extent so the two align pixel-for-pixel. */}
          <Placed
            x={{ start: 0, size: 2 }}
            y={RAIL_BAND_Y}
            className="bg-foreground/60"
          />
          {/* Small neutral key chip — names the key without a colored band,
              floating in the headroom just above the rail. */}
          <Placed
            as="span"
            x={{ start: 4 }}
            y={{ end: "50%" }}
            // eslint-disable-next-line text/no-adhoc-typography, spacing/no-adhoc-spacing -- leading-none keeps the key chip slim enough to match the bands below; mb-2 lifts it into the headroom above the rail (no named margin step for that offset)
            className="mb-2 whitespace-nowrap rounded-sm bg-muted px-xs text-3xs font-medium leading-none text-foreground/80"
          >
            {keyLabel(e.key)}
          </Placed>
        </Placed>
      ))}
    </Layer>
  );
}
