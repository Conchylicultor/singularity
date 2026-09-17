import { z } from "zod";
import { LoadScopeSchema } from "./scope";

// ── Where the index stands, as the app shows it ──────────────────────────────

/**
 * The phases a load writes to its state row, in order. `ready` and `failed`
 * end a load.
 *
 * - `downloading` — fetching Sheet Sage's two files into the cache (once per machine).
 * - `building-snapshot` — streaming them into the compact snapshot, or waiting
 *   for another process on this machine that is building it.
 * - `loading` — deriving the snapshot's sections into the tables.
 */
export const INDEX_LOAD_PHASES = [
  "downloading",
  "building-snapshot",
  "loading",
] as const;
export const IndexLoadPhaseSchema = z.enum(INDEX_LOAD_PHASES);
export type IndexLoadPhase = z.infer<typeof IndexLoadPhaseSchema>;

export const IndexPhaseSchema = z.enum([
  ...INDEX_LOAD_PHASES,
  "ready",
  "failed",
]);
export type IndexPhase = z.infer<typeof IndexPhaseSchema>;

/**
 * The index's status:
 *
 * - `not-requested` — nobody opened the app on this instance: nothing is
 *   downloaded or loaded, and nothing will be until `ensure` is called.
 * - `loading` — a load is on its way. `queued` means the app was opened and the
 *   load job has not started yet. `done` / `total` count sections during
 *   `loading`, and are `null` before it.
 * - `ready` — the index answers queries.
 * - `failed` — the last load threw; `ensure` retries.
 */
export const IndexStatusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not-requested") }),
  z.object({
    kind: z.literal("loading"),
    phase: z.enum(["queued", ...INDEX_LOAD_PHASES]),
    done: z.number().int().nullable(),
    total: z.number().int().nullable(),
  }),
  z.object({
    kind: z.literal("ready"),
    scope: LoadScopeSchema,
    sections: z.number().int(),
    windows: z.number().int(),
  }),
  z.object({ kind: z.literal("failed"), error: z.string() }),
]);
export type IndexStatus = z.infer<typeof IndexStatusSchema>;
