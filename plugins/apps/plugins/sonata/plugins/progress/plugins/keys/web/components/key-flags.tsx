import type {
  Annotation,
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

type KeyEntry = { beat: number; key: KeySignature };

/**
 * Resolve the song's key entries from the Score: the starting `meta.key` at
 * beat 0 plus every well-formed `key` annotation. If an annotation also sits at
 * beat 0 it wins over the meta starting key, so the bar never carries two flags
 * stacked at the same position.
 */
function collectKeyEntries(score: Score): KeyEntry[] {
  const byBeat = new Map<number, KeySignature>();

  if (score.meta.key) byBeat.set(0, score.meta.key);

  for (const a of score.annotations) {
    if (a.type !== "key") continue;
    const key = asKeySignature(a);
    if (!key) continue; // skip malformed payloads — fail quietly, not loudly here.
    byBeat.set(a.start, key); // an annotation at beat 0 overrides meta.key.
  }

  return [...byBeat.entries()]
    .map(([beat, key]) => ({ beat, key }))
    .sort((x, y) => x.beat - y.beat);
}

/**
 * Defensive narrowing of an annotation's `unknown` data to a `KeySignature`:
 * an object with a string `tonic` and a `mode` of "major" | "minor".
 */
function asKeySignature(a: Annotation): KeySignature | null {
  const data = a.data;
  if (typeof data !== "object" || data === null) return null;
  const { tonic, mode } = data as Record<string, unknown>;
  if (typeof tonic !== "string") return null;
  if (mode !== "major" && mode !== "minor") return null;
  return { tonic, mode };
}

/** Compact label, e.g. `C maj` / `A min`. */
function formatKey(key: KeySignature): string {
  return `${key.tonic} ${key.mode === "major" ? "maj" : "min"}`;
}
