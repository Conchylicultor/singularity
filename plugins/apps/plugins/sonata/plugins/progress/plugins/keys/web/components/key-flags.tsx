import {
  collectKeyEntries,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import type {
  KeySignature,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Key-signature flags along the progression bar.
 *
 * A song's tonal centre is meaning layered on top of the notes, so it lives in
 * exactly two places in the Score: the *starting* key (`score.meta.key`) and any
 * mid-song key changes, which the IR models as `type: "key"` annotations. This
 * marker reads both and plants a tiny flag at each beat where the key is
 * established.
 *
 * NOTE: no input source emits `key` annotations today — the built-in annotation
 * union doesn't even declare a `KeyData` shape, so an annotation's `data` is
 * typed as `unknown` and must be narrowed defensively. The marker is wired up
 * and ready regardless: the moment a source or analyzer starts emitting key
 * changes, the flags appear with zero edits here.
 */
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
      {entries.map((e) => (
        <div
          key={`${e.beat}-${e.key.tonic}-${e.key.mode}`}
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${beatToFraction(e.beat) * 100}%` }}
        >
          <span className="-mt-3 text-3xs leading-none text-muted-foreground">
            {formatKey(e.key)}
          </span>
          {/* A short tick anchoring the label to the rail. */}
          <span className="mt-px h-2 w-px bg-muted-foreground/60" />
        </div>
      ))}
    </div>
  );
}

/** Compact label, e.g. `C maj` / `A min`. */
function formatKey(key: KeySignature): string {
  return `${key.tonic} ${key.mode === "major" ? "maj" : "min"}`;
}
