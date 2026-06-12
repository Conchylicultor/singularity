import { useMemo } from "react";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  collectKeyEntries,
  type KeySignature,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Current-key chip — a screen-anchored HUD pill over the piano roll showing the
 * key in force at the playhead, tracked live as the transport advances.
 *
 * A song's key lives in the Score as the starting `meta.key` plus mid-song
 * `type:"key"` annotations; `collectKeyEntries` reconciles both into a sorted,
 * beat-indexed list. We memoize that list off the Score so the per-frame cost is
 * just the tiny walk to the active entry below — not a re-scan of every frame.
 */
export function KeyChip() {
  const { score, cursorBeat } = useSonata();

  // Beat-indexed key entries — recomputed only when the Score changes.
  const entries = useMemo(() => collectKeyEntries(score), [score]);

  // The key in force at the playhead: the latest entry at or before the cursor.
  // Before the first entry we fall back to the opening key, so the chip is never
  // blank when a key is known (e.g. cursor at 0 with a pickup-delayed first key).
  const current = useMemo<KeySignature | undefined>(() => {
    let active: KeySignature | undefined;
    for (const e of entries) {
      if (e.beat <= cursorBeat) active = e.key;
      else break; // entries are ascending — no later one can apply.
    }
    return active ?? entries[0]?.key;
  }, [entries, cursorBeat]);

  if (!current) return null; // keyless score → no chip.

  return (
    // eslint-disable-next-line text/no-adhoc-typography -- compact HUD pill: leading must stay 1 so the chip stays slim; size via the text-2xs sub-scale, matching the chord overlay
    <div className="pointer-events-none rounded-full border border-border/60 bg-background/90 px-sm py-xs text-2xs font-semibold leading-none text-foreground shadow-sm backdrop-blur-sm">
      <span className="text-muted-foreground">Key </span>
      {current.tonic}{" "}
      <span className="text-muted-foreground">
        {current.mode === "major" ? "maj" : "min"}
      </span>
    </div>
  );
}
