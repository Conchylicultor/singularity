import { z } from "zod";
import {
  HookpadChordSchema,
  type HookpadChord,
} from "@plugins/integrations/plugins/hooktheory/core";
import type { IndexedChord } from "./indexed-chord";
import { ChordTokenSchema, type ChordToken } from "./token";

// ── A chord as the index stores it: compact, every field recoverable ─────────
//
// A section's chords are one jsonb array. Written in full, a Hookpad chord is
// ~250 bytes of mostly defaults (empty arrays, `null`, `""`, `false`, 0), and
// there are ~450k of them in the dump. So a field holding its default is left
// out on write and restored on read (`expandChord`), and nothing is lost:
// `compactChord` then `expandChord` is the identity on the Hookpad fields.

export const StoredChordSchema = z.object({
  beat: z.number(),
  duration: z.number(),
  root: z.number(),
  type: z.number(),
  /** The chord's sound token; absent on a chord that does not sound (a rest). */
  token: ChordTokenSchema.optional(),
  inversion: z.number().optional(),
  applied: z.number().optional(),
  adds: z.array(z.number()).optional(),
  omits: z.array(z.number()).optional(),
  alterations: z.array(z.string()).optional(),
  suspensions: z.array(z.number()).optional(),
  borrowed: HookpadChordSchema.shape.borrowed.optional(),
  isRest: z.literal(true).optional(),
  pedal: z.unknown().optional(),
  alternate: z.string().optional(),
});
export type StoredChord = z.infer<typeof StoredChordSchema>;

/** A chord read back: every Hookpad field, plus its token (`null` when it does not sound). */
export const TokenizedChordSchema = HookpadChordSchema.extend({
  token: ChordTokenSchema.nullable(),
});
export type TokenizedChord = z.infer<typeof TokenizedChordSchema>;

export function compactChord({ chord, reading }: IndexedChord): StoredChord {
  const stored: StoredChord = {
    beat: chord.beat,
    duration: chord.duration,
    root: chord.root,
    type: chord.type,
  };
  if (reading.kind === "sound") stored.token = reading.token;
  if (chord.inversion !== 0) stored.inversion = chord.inversion;
  if (chord.applied !== 0) stored.applied = chord.applied;
  if (chord.adds.length > 0) stored.adds = chord.adds;
  if (chord.omits.length > 0) stored.omits = chord.omits;
  if (chord.alterations.length > 0) stored.alterations = chord.alterations;
  if (chord.suspensions.length > 0) stored.suspensions = chord.suspensions;
  // `""` and `null` both mean "not borrowed", and both occur: kept apart so the
  // spelling round-trips exactly.
  if (chord.borrowed !== null) stored.borrowed = chord.borrowed;
  if (chord.isRest) stored.isRest = true;
  if (chord.pedal !== null && chord.pedal !== undefined)
    stored.pedal = chord.pedal;
  if (chord.alternate !== "") stored.alternate = chord.alternate;
  return stored;
}

export function expandChord(stored: StoredChord): TokenizedChord {
  const chord: HookpadChord = {
    beat: stored.beat,
    duration: stored.duration,
    root: stored.root,
    type: stored.type,
    inversion: stored.inversion ?? 0,
    applied: stored.applied ?? 0,
    adds: stored.adds ?? [],
    omits: stored.omits ?? [],
    alterations: stored.alterations ?? [],
    suspensions: stored.suspensions ?? [],
    borrowed: stored.borrowed ?? null,
    isRest: stored.isRest ?? false,
    pedal: stored.pedal ?? null,
    alternate: stored.alternate ?? "",
  };
  const token: ChordToken | null = stored.token ?? null;
  return { ...chord, token };
}
