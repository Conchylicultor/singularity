import { z } from "zod";
import { BeatFeaturesSchema } from "./beat-features";

/** What a running analysis is doing right now. */
export const AnalysisPhaseSchema = z.enum([
  "fetching",
  "installing",
  "analysing",
]);
export type AnalysisPhase = z.infer<typeof AnalysisPhaseSchema>;

/**
 * Where one video's beat features stand on this machine, at the current
 * {@link ANALYSIS_VERSION}:
 *
 * - `absent` — never analysed at this version, or an analysis was killed
 *   mid-way (its `running` marker is stale: nobody holds its lock).
 * - `running` — some process on the machine (any worktree) is analysing it.
 * - `ready` — the features, validated before they were written.
 * - `failed` — the last analysis threw. `permanent` when retrying cannot help
 *   (YouTube will not serve the video); a request does not retry those
 *   unless forced.
 */
export const BeatFeaturesStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("absent") }),
  z.object({
    kind: z.literal("running"),
    since: z.string(),
    phase: AnalysisPhaseSchema,
  }),
  z.object({ kind: z.literal("ready"), features: BeatFeaturesSchema }),
  z.object({
    kind: z.literal("failed"),
    message: z.string(),
    at: z.string(),
    permanent: z.boolean(),
  }),
]);
export type BeatFeaturesState = z.infer<typeof BeatFeaturesStateSchema>;
