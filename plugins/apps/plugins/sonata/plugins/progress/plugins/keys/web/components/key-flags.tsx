import {
  collectKeyEntries,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import type {
  KeySignature,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Key-signature regions along the progression bar.
 *
 * A song's tonal centre is meaning layered on top of the notes: the *starting*
 * key (`score.meta.key`) plus any mid-song key changes, which the IR models as
 * `type:"key"` annotations. `collectKeyEntries` reconciles both into a sorted
 * list of "key established at beat X" entries; here we turn each entry into the
 * span it governs — `[entry.beat, nextEntry.beat)`, the last running to the song
 * end — and paint it as a tinted band with a highlighted vertical bar at the
 * boundary where the key takes hold. A song that moves through three keys reads
 * as three colored regions at a glance, each delimited by its change bar.
 *
 * Colors key the *identity* of the key, not its position: the same key returning
 * later (e.g. an A→C→A modulation) reuses its hue, so a return reads as a return.
 *
 * Lives in the marker layer's TOP half; the section bands own the bottom half,
 * so the two structural strata stack without fighting for the same pixels.
 */

// Themeable categorical palette (the same data-viz tokens the section bands and
// Gantt phases use, so the tints re-skin with the active theme). Two strengths
// per slot: a faint band tint for the region, and a solid bar for the change
// boundary, so the boundary reads as a highlight standing over its own region.
const BAND = [
  "bg-categorical-1/15",
  "bg-categorical-2/15",
  "bg-categorical-3/15",
  "bg-categorical-4/15",
];
const BAR = [
  "bg-categorical-1",
  "bg-categorical-2",
  "bg-categorical-3",
  "bg-categorical-4",
];

/** Compact label, e.g. `C maj` / `A min`. */
function keyLabel(key: KeySignature): string {
  return `${key.tonic} ${key.mode === "major" ? "maj" : "min"}`;
}

/** Stable identity for hue assignment — same key → same string. */
function keyId(key: KeySignature): string {
  return `${key.tonic}-${key.mode}`;
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

  const endBeat = scoreEndBeat(score);

  // Stable hue per distinct key — a returning key reuses its color slot.
  const hueOf = new Map<string, number>();
  for (const e of entries) {
    const id = keyId(e.key);
    if (!hueOf.has(id)) hueOf.set(id, hueOf.size);
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2">
      {entries.map((e, idx) => {
        const next = entries[idx + 1];
        const startF = beatToFraction(e.beat);
        const endF = beatToFraction(next ? next.beat : endBeat);
        const hue = (hueOf.get(keyId(e.key)) ?? 0) % BAND.length;
        return (
          <div
            key={`${e.beat}-${keyId(e.key)}`}
            className={`absolute inset-y-0 flex items-center overflow-hidden rounded-sm ${BAND[hue]}`}
            style={{
              left: `${startF * 100}%`,
              width: `${(endF - startF) * 100}%`,
            }}
            title={keyLabel(e.key)}
          >
            {/* Highlighted vertical bar marking where this key takes hold. */}
            <div className={`absolute inset-y-0 left-0 w-0.5 ${BAR[hue]}`} />
            {/* eslint-disable-next-line text/no-adhoc-typography -- tight key label: line-height must stay 1 so the band stays slim, matching the section bands below */}
            <span className="overflow-hidden text-ellipsis whitespace-nowrap pl-1.5 text-3xs font-medium leading-none text-foreground/70">
              {keyLabel(e.key)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
