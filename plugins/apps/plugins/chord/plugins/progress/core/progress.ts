import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  ChordTokenSchema,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";

// ── The live stats: `chord.progress` ─────────────────────────────────────────

const count = z.number().int().min(0);

/** One chord, over its last `MASTERY_WINDOW` answers (`chordMastery`). */
export const ChordStandingSchema = z.object({
  token: ChordTokenSchema,
  /** Answers in the window: at most `MASTERY_WINDOW`. */
  answers: count,
  correct: count,
  accuracy: z.number().nullable(),
  medianMs: z.number().nullable(),
  mastered: z.boolean(),
});
export type ChordStanding = z.infer<typeof ChordStandingSchema>;

export const ChordProgressSchema = z.object({
  /** One per requested token, in the params' (canonical, sorted) order. */
  chords: z.array(ChordStandingSchema),
  /** Since local midnight in the params' time zone. `songs` counts checked rounds. */
  today: z.object({
    songs: count,
    answers: count,
    correct: count,
    /** The sum of today's answer times. */
    totalMs: z.number().min(0),
  }),
  allTime: z.object({ songs: count, answers: count, correct: count }),
});
export type ChordProgress = z.infer<typeof ChordProgressSchema>;

/**
 * The resource's params, on the wire. Build them with `encodeProgressParams`
 * only: `tokens` is the chord set sorted, deduplicated and joined by commas, so
 * one set is one subscription, and the server refuses any other spelling.
 */
export type ChordProgressParams = { timeZone: string; tokens: string };

/** What the params say. */
export type DecodedProgressParams = {
  /** An IANA zone (`Europe/Paris`): where "today" starts. */
  timeZone: string;
  tokens: ChordToken[];
};

/** Throws on a string that is not a time zone `Intl` knows. */
function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch (err) {
    if (err instanceof RangeError) {
      throw new Error(
        `"${timeZone}" is not a time zone (expected an IANA name, e.g. "Europe/Paris")`,
        { cause: err },
      );
    }
    throw err;
  }
}

/** The canonical order of a chord set: plain string order, duplicates dropped. */
function canonicalTokens(tokens: readonly ChordToken[]): ChordToken[] {
  return [...new Set(tokens)].sort();
}

/** The one spelling of a (time zone, chord set) pair. Throws on an unknown time zone. */
export function encodeProgressParams(
  decoded: DecodedProgressParams,
): ChordProgressParams {
  assertTimeZone(decoded.timeZone);
  return {
    timeZone: decoded.timeZone,
    tokens: canonicalTokens(decoded.tokens).join(","),
  };
}

/**
 * Read the params back. Throws on an unknown time zone, on a string that is not
 * a chord token, and on a set not in its canonical spelling (unsorted or
 * repeated) — `encodeProgressParams` never produces one, so something built the
 * params by hand. An empty `tokens` is the empty set.
 */
export function decodeProgressParams(
  params: ChordProgressParams,
): DecodedProgressParams {
  assertTimeZone(params.timeZone);
  const tokens =
    params.tokens === ""
      ? []
      : params.tokens.split(",").map((text) => {
          const parsed = ChordTokenSchema.safeParse(text);
          if (!parsed.success) {
            throw new Error(
              `chord.progress params: "${text}" is not a chord token`,
            );
          }
          return parsed.data;
        });
  const canonical = canonicalTokens(tokens).join(",");
  if (canonical !== params.tokens) {
    throw new Error(
      `chord.progress params: tokens "${params.tokens}" are not in canonical form ("${canonical}"); build params with encodeProgressParams`,
    );
  }
  return { timeZone: params.timeZone, tokens };
}

/**
 * The learner's standing: per chord of `tokens`, today, and all time. Pushed
 * again whenever an answer is saved.
 *
 * The descriptor API requires an initial value; this one is never shown.
 * `useResource` seeds it at `dataUpdatedAt === 0` and answers `pending` (no
 * `.data`) until the server's first value lands, so a surface renders its
 * loading state, never these zeros.
 */
export const chordProgressResource = resourceDescriptor<
  ChordProgress,
  ChordProgressParams
>("chord.progress", ChordProgressSchema, {
  chords: [],
  today: { songs: 0, answers: 0, correct: 0, totalMs: 0 },
  allTime: { songs: 0, answers: 0, correct: 0 },
});
