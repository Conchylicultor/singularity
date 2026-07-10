import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * Wire/DB shape of one hand's rhythm pattern. Mirrors `RhythmPattern` from
 * `sonata/plugins/rhythm/core` structurally (the inferred `onsets` is a plain
 * `number[]`; the core type's `readonly number[]` is a strict supertype, so a
 * row value flows into the core ops and the shell store without a cast).
 *
 * The `.refine` rejects a payload whose onset falls outside `[0, subdivisions)`
 * loudly (a 4xx on the write path) rather than silently coercing it — a bad
 * onset is a bug, not an absorbable value.
 */
export const RhythmPatternSchema = z
  .object({
    presetId: z.string().nullable(),
    subdivisions: z.number().int().min(1).max(48),
    onsets: z.array(z.number().int().nonnegative()),
    rotation: z.number().int(),
  })
  .refine((p) => p.onsets.every((o) => o < p.subdivisions), {
    message: "every onset must be < subdivisions",
  });

/**
 * One song's persisted rhythm groove: whether it is active plus the two hands'
 * patterns. Stored in the `sonata_songs_ext_rhythm` entity-extension table (1:1
 * per song); an absent row reads as disabled (today's block-chord behavior).
 * Both patterns are remembered even while disabled, so re-enabling restores the
 * groove rather than resetting to defaults.
 */
export const RhythmRowSchema = z.object({
  songId: z.string(),
  enabled: z.boolean(),
  bass: RhythmPatternSchema,
  chord: RhythmPatternSchema,
});
export type RhythmRow = z.infer<typeof RhythmRowSchema>;

/** Reactive list of every song's rhythm groove (push resource). */
export const rhythmResource = resourceDescriptor<RhythmRow[]>(
  "sonata-rhythm",
  z.array(RhythmRowSchema),
  [],
);
