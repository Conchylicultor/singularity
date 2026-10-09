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
 * line up pixel-for-pixel. The key's name is the bar's hover tooltip, not a
 * floating caption: the band above the rail belongs to the chord lane.
 */

/** Width of a key bar's hover hit box, and where the 2px bar sits inside it. */
const HIT_PX = 8;
const BAR_INSET_PX = 3;

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
        // A hit box a few px wider than the bar, over the rail band, so the
        // tooltip is reachable; it re-enables pointer events for its own box
        // only, and a press still bubbles to the scrubber and seeks.
        <Placed
          key={`${e.beat}-${keyLabel(e.key)}`}
          x={{
            start: pct(beatToFraction(e.beat)),
            size: HIT_PX,
            shift: -BAR_INSET_PX,
          }}
          y={RAIL_BAND_Y}
          className="pointer-events-auto"
          title={`Key: ${keyLabel(e.key)}`}
        >
          {/* Strong vertical bar marking where this key takes hold — a
              highlighted sibling of the muted bar ticks, spanning the shared
              rail band so the two align pixel-for-pixel. */}
          <Placed
            x={{ start: BAR_INSET_PX, size: 2 }}
            y="fill"
            className="bg-foreground/60"
          />
        </Placed>
      ))}
    </Layer>
  );
}
