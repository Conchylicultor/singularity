import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import {
  HookpadModeSchema,
  TheorytabSectionIdSchema,
} from "@plugins/integrations/plugins/hooktheory/core";
import { VideoStatusSchema } from "@plugins/apps/plugins/chord/plugins/video-availability/core";
import { AlignmentSchema } from "./beat-time";
import { CHORD_FEATURES } from "./features";
import { IndexStatusSchema } from "./index-status";
import { LOOP_SHAPE_IDS } from "./loop-shapes";
import { TokenizedChordSchema } from "./stored-chord";
import { ChordTokenSchema } from "./token";

// ── The index's HTTP surface ─────────────────────────────────────────────────
//
// Both reads answer `not-ready` (with the status) until the index is loaded —
// never an empty list, which would read as "no song fits".

/**
 * Open the index: record that this instance uses the app, and start a load
 * when the index is missing, stale (another snapshot, scope or derivation
 * version) or failed. Idempotent — a second call while a load runs joins it.
 */
export const ensureChordIndexEndpoint = defineEndpoint({
  route: "POST /api/chord/index/ensure",
  response: IndexStatusSchema,
});

const ChordFeatureSchema = z.enum(CHORD_FEATURES);
const LoopShapeIdSchema = z.enum(LOOP_SHAPE_IDS);

/** A loop window as the trainer ranks and plays it. Beats are Hookpad's, 1-based. */
export const LoopWindowFieldsSchema = z.object({
  shape: LoopShapeIdSchema,
  startBeat: z.number(),
  endBeat: z.number(),
  bars: z.number().int(),
  beatsPerBar: z.number(),
  beatUnit: z.number(),
  keyTonic: z.string(),
  keyMode: HookpadModeSchema,
  chordTokens: z.array(ChordTokenSchema),
  features: z.array(ChordFeatureSchema),
  chordCount: z.number().int(),
  changeCount: z.number().int(),
  hasRest: z.boolean(),
  startsOnChange: z.boolean(),
});

export const LoopCandidateSchema = z.object({
  sectionId: TheorytabSectionIdSchema,
  artist: z.string(),
  song: z.string(),
  sectionName: z.string(),
  /** Every window has a video: a section without one has no windows. */
  videoId: z.string(),
  /** From the dump, when it knew it. A video-fraction alignment needs it (or the player's). */
  videoDurationSeconds: z.number().nullable(),
  /**
   * What is known about the video, as of this answer: `ok` (checked, it plays)
   * or `unknown` (nobody could tell yet). Never `gone` or `not-embeddable` —
   * `find` leaves those out.
   */
  videoStatus: VideoStatusSchema,
  alignment: AlignmentSchema,
  window: LoopWindowFieldsSchema,
  /** The section's chords overlapping the window (one ringing in from before counts), in beat order. */
  chords: z.array(TokenizedChordSchema),
});
export type LoopCandidate = z.infer<typeof LoopCandidateSchema>;

const NotReadySchema = z.object({
  kind: z.literal("not-ready"),
  status: IndexStatusSchema,
});

/** Most candidates one find returns. The trainer asks for a small batch, often. */
export const FIND_LOOPS_MAX_LIMIT = 50;

export const FindLoopsBodySchema = z
  .object({
    /** The allowed chords: every chord of a returned window is one of these. */
    unlocked: z.array(ChordTokenSchema).min(1),
    /** The chord being learned: every returned window contains it. Must be unlocked. */
    target: ChordTokenSchema,
    shape: LoopShapeIdSchema.default("bars-4"),
    /** Keep windows in one of these modes; absent = any. */
    modes: z.array(HookpadModeSchema).min(1).optional(),
    /** Keep windows whose spelling has every one of these features. */
    requireFeatures: z.array(ChordFeatureSchema).min(1).optional(),
    /** Drop windows whose spelling has any of these features. */
    forbidFeatures: z.array(ChordFeatureSchema).min(1).optional(),
    /** Sections to leave out (recently played). */
    excludeSectionIds: z.array(TheorytabSectionIdSchema).min(1).optional(),
    limit: z.number().int().min(1).max(FIND_LOOPS_MAX_LIMIT),
  })
  .refine((body) => body.unlocked.includes(body.target), {
    message:
      "target must be one of the unlocked chords: no window could hold it otherwise",
    path: ["target"],
  });
export type FindLoopsBody = z.infer<typeof FindLoopsBodySchema>;

/** Random loop windows whose chords are all unlocked and include the target. */
export const findLoopsEndpoint = defineEndpoint({
  route: "POST /api/chord/loops/find",
  body: FindLoopsBodySchema,
  response: z.discriminatedUnion("kind", [
    NotReadySchema,
    z.object({
      kind: z.literal("ready"),
      candidates: z.array(LoopCandidateSchema),
    }),
  ]),
});

export const NEXT_CHORDS_MAX_LIMIT = 200;

export const NextChordsBodySchema = z.object({
  unlocked: z.array(ChordTokenSchema).min(1),
  shape: LoopShapeIdSchema.default("bars-4"),
  modes: z.array(HookpadModeSchema).min(1).optional(),
  limit: z.number().int().min(1).max(NEXT_CHORDS_MAX_LIMIT).default(20),
});
export type NextChordsBody = z.infer<typeof NextChordsBodySchema>;

export const NextChordCountSchema = z.object({
  token: ChordTokenSchema,
  /** Windows whose chords are the unlocked set plus exactly this one. */
  windows: z.number().int(),
});
export type NextChordCount = z.infer<typeof NextChordCountSchema>;

/**
 * For each chord outside the unlocked set, how many windows unlocking it would
 * add: windows made of unlocked chords plus exactly that one. Most first.
 */
export const nextChordsEndpoint = defineEndpoint({
  route: "POST /api/chord/loops/next-chords",
  body: NextChordsBodySchema,
  response: z.discriminatedUnion("kind", [
    NotReadySchema,
    z.object({
      kind: z.literal("ready"),
      nextChords: z.array(NextChordCountSchema),
    }),
  ]),
});
