/**
 * PURE grace-note pre-pass — pulled out ahead of voice-partitioning so ornament
 * notes neither distort voicing nor get quantized away. Renderer-free + tested.
 *
 * A grace note is a very short note (`duration < GRACE_MAX`, ≈ a 32nd) sounded
 * *immediately* before a real *principal* note it decorates. On the fixed 1/16
 * grid these vanished (their span rounded below a 16th and the converter dropped
 * them). Here we lift them out of the note stream, attach each to its principal,
 * and hand the converter a `graceByPrincipalId` map plus the principal-only
 * `mainNotes` to engrave normally. The engraver later renders the attached graces
 * as VexFlow modifiers on the principal's stave note.
 *
 * The load-bearing test is **immediacy**, not just brevity. A 32nd note in a run
 * is also short and also followed by a longer note — duration alone can't tell it
 * from a grace. The distinguisher is the *gap*: an ornament is squeezed hard
 * against its principal (gap `< GRACE_GAP`, half a 32nd), while a 32nd sits a
 * full 32nd (0.125 beat) away. So detection walks **backward** from each real
 * note, collecting a chain of short notes each within `GRACE_GAP` of the next —
 * a whole grace group binds even though its earliest note is >`GRACE_GAP` from
 * the principal, while a metrically-spaced 32nd never chains in.
 *
 * A short note that chains into no principal is simply **kept** in `mainNotes`
 * (a note is never dropped here); it engraves as an ordinary short note.
 */
import type { Note, PitchSpelling } from "@plugins/apps/plugins/sonata/plugins/score/core";

/** One extracted grace note, ready for per-principal grouping + engraving. */
export interface GraceInfo {
  /** MIDI pitch of the grace. */
  pitch: number;
  /** Staff spelling when the source carries one (else the converter spells it). */
  spelling?: PitchSpelling;
  /** Whether the group this grace belongs to is slashed (a lone acciaccatura). */
  slash: boolean;
}

/** Grace extraction knobs (defaults match the design doc). */
export interface ExtractGracesOptions {
  /** A note this short (in beats) is a grace candidate. Default ≈ a 32nd. */
  graceMax?: number;
  /**
   * Max beat gap between a grace and the note it leans into (the principal, or
   * the next grace in the group). Half a 32nd by default, so a metrically-spaced
   * 32nd (a full 0.125 beat before the next note) never reads as an ornament.
   */
  graceGap?: number;
}

/** The pre-pass output: principal-only notes + graces keyed by principal id. */
export interface ExtractGracesResult {
  /** Every non-grace note, in the input order (graces removed). */
  mainNotes: Note[];
  /** Ordered grace groups, keyed by the principal note they decorate. */
  graceByPrincipalId: Map<string, GraceInfo[]>;
}

/** Longest a note can be and still count as a grace candidate (a 32nd-ish). */
const DEFAULT_GRACE_MAX = 0.13;

/** Max beat gap in a grace chain — half a 32nd, so a real 32nd never chains in. */
const DEFAULT_GRACE_GAP = 0.0625;

/** Onset-collision slack, so a grace landing a hair before its principal binds. */
const EPS = 1e-6;

/**
 * Extract leading grace notes from a note stream.
 *
 * For each **principal** (a note of normal length, `duration ≥ graceMax`) the
 * detector walks *backward* through the same track's notes, collecting a chain
 * of short notes (`duration < graceMax`) where each note is within `graceGap` of
 * the note it leans into (the principal, then each collected grace). The chain
 * stops at the first note that is long, too far, or already claimed. So a whole
 * grace group binds even though its earliest note is more than one gap from the
 * principal, while a metrically-spaced 32nd (a full 0.125 beat before the next
 * note) never chains in — closing the 32nd-vs-grace ambiguity that duration
 * alone can't resolve. A lone grace is a slashed acciaccatura; several are an
 * unslashed group.
 *
 * A short note that chains into no principal is **kept** in `mainNotes` — never
 * dropped. Pure — never mutates the input.
 */
export function extractGraces(
  notes: readonly Note[],
  opts?: ExtractGracesOptions,
): ExtractGracesResult {
  const graceMax = opts?.graceMax ?? DEFAULT_GRACE_MAX;
  const graceGap = opts?.graceGap ?? DEFAULT_GRACE_GAP;

  // Per-track notes sorted by onset, so the backward chain-walk is local. The
  // index into each track's sorted array locates a note's predecessors.
  const byTrack = new Map<string, Note[]>();
  for (const n of notes) {
    const bucket = byTrack.get(n.track);
    if (bucket) bucket.push(n);
    else byTrack.set(n.track, [n]);
  }

  const consumed = new Set<string>(); // note ids claimed as graces
  const graceByPrincipalId = new Map<string, GraceInfo[]>();

  for (const trackNotes of byTrack.values()) {
    // By onset; on a tie, shorter first — so a grace colliding exactly on its
    // principal's onset still orders before it (and gets collected walking back).
    const sorted = [...trackNotes].sort(
      (a, b) => a.start - b.start || a.duration - b.duration,
    );
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]!;
      if (p.duration < graceMax) continue; // only real notes anchor a chain.

      // Walk backward collecting short notes that chain into `p`.
      const group: Note[] = [];
      let leansInto = p.start;
      for (let j = i - 1; j >= 0; j--) {
        const g = sorted[j]!;
        if (consumed.has(g.id) || g.duration >= graceMax) break;
        const gap = leansInto - g.start;
        if (gap < -EPS || gap > graceGap + EPS) break;
        group.unshift(g);
        consumed.add(g.id);
        leansInto = g.start;
      }
      if (group.length === 0) continue;

      const slash = group.length === 1; // lone grace = acciaccatura.
      graceByPrincipalId.set(
        p.id,
        group.map((g) => ({ pitch: g.pitch, spelling: g.spelling, slash })),
      );
    }
  }

  // Everything not claimed as a grace stays a main note, in original input order.
  const mainNotes = notes.filter((n) => !consumed.has(n.id));

  return { mainNotes, graceByPrincipalId };
}
