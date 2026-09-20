import { z } from "zod";
import {
  HookpadModeSchema,
  type HookpadMode,
} from "@plugins/integrations/plugins/hooktheory/core";
import { ChordTokenSchema } from "./token";

// ── What unlocking one more chord would open ─────────────────────────────────
//
// The count is split by the key mode of the window, because the caller decides
// which modes it cares about: a chord worth nothing in major can be the biggest
// step in minor, and a curriculum that opens minor keys must be able to see
// that. A single total over "whichever modes were scanned" is a number nobody
// can read without knowing that scan, so there is none.

/**
 * Windows by the key mode they are in. A mode with no window is absent, so the
 * caller sums the modes it cares about (`windowsInModes`) rather than reading a
 * zero that might mean "not scanned".
 */
export const WindowsByModeSchema = z
  .object(
    Object.fromEntries(
      HookpadModeSchema.options.map((mode) => [mode, z.number().int()]),
    ) as Record<HookpadMode, z.ZodNumber>,
  )
  .partial()
  // A key that is not one of Hookpad's modes means the windows table holds a
  // mode this build does not know: loud, rather than quietly dropped.
  .strict();
export type WindowsByMode = z.infer<typeof WindowsByModeSchema>;

export const NextChordCountSchema = z.object({
  token: ChordTokenSchema,
  /**
   * Windows whose chords are the unlocked set plus exactly this one, counted
   * per key mode.
   */
  byMode: WindowsByModeSchema,
});
export type NextChordCount = z.infer<typeof NextChordCountSchema>;

/**
 * How many windows this chord would open in the modes the caller asked about.
 *
 * Throws on an empty mode list: summing no modes is always 0, which would rank
 * every chord the same and stall a curriculum without ever failing.
 */
export function windowsInModes(
  count: NextChordCount,
  modes: readonly HookpadMode[],
): number {
  if (modes.length === 0) {
    throw new Error(
      "windowsInModes needs at least one mode: a sum over no mode is 0 for every chord",
    );
  }
  let windows = 0;
  for (const mode of modes) windows += count.byMode[mode] ?? 0;
  return windows;
}

/** The largest single mode's count: how the rows are ranked. */
export function bestModeWindows(count: NextChordCount): number {
  return Math.max(0, ...Object.values(count.byMode));
}
