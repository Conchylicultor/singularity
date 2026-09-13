import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  defaultBassPattern,
  defaultChordPattern,
  type RhythmPattern,
} from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

/**
 * Wire/DB shape of one hand's rhythm pattern. Mirrors `RhythmPattern` from
 * `sonata/plugins/rhythm/core` structurally (the inferred `onsets` is a plain
 * `number[]`, which the core type's `readonly number[]` accepts, so a parsed
 * value flows into the core ops and the shell store without a cast).
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
 * per song), which `server/internal/tables.ts` builds from this shape; an absent
 * row reads as disabled (today's block-chord behavior). Both patterns are
 * remembered even while disabled, so re-enabling restores the groove rather than
 * resetting to defaults.
 */
export const rhythmShape = defineExtensionShape({
  key: "songId",
  fields: {
    enabled: boolField(),
    // Each hand's onset pattern, as jsonb decoded by `RhythmPatternSchema` — the
    // SAME schema the HTTP write boundary validates against, so an onset outside
    // `[0, subdivisions)` is impossible to store by any route, not just the
    // endpoint. Typed as the core `RhythmPattern` (`readonly onsets`).
    bass: jsonField<RhythmPattern>({
      schema: RhythmPatternSchema,
      default: defaultBassPattern(),
    }),
    chord: jsonField<RhythmPattern>({
      schema: RhythmPatternSchema,
      default: defaultChordPattern(),
    }),
    // Each hand's tone-order figuration id (the *what*, orthogonal to the rhythm
    // *when*). Kept a plain string: an unknown id throws loudly downstream in
    // `findFiguration`, not an absorbable value here.
    bassPatternId: textField(),
    chordPatternId: textField(),
  },
});
export const RhythmRowSchema = rhythmShape.schema;
export type RhythmRow = z.infer<typeof RhythmRowSchema>;

/** Reactive list of every song's rhythm groove (push resource). */
export const rhythmResource = resourceDescriptor<RhythmRow[]>(
  "sonata-rhythm",
  z.array(RhythmRowSchema),
  [],
);
