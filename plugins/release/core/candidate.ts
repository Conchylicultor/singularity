import { z } from "zod";
import { ReleaseManifestSchema } from "@plugins/release/plugins/bundles/core";
import type {
  BundleRefusal,
  BundleResolution,
  Staleness,
} from "@plugins/release/plugins/bundles/core";
import { ReleaseRunSchema } from "./resources";

/**
 * The wire schemas for the two verdicts `GET /api/release/candidate` carries
 * across the network: bundle discovery's `BundleResolution` and provenance's
 * `Staleness`.
 *
 * Both TYPES are owned by `@plugins/release/plugins/bundles/core` — that plugin
 * is the single authority on what a bundle is and why it isn't shippable, and it
 * stays free of any transport concern (a CLI process asks it the same question
 * with no HTTP anywhere in sight). What lives here is only their *serialization*,
 * which is this plugin's endpoint's business.
 *
 * The `satisfies z.ZodType<…>` on each schema is what keeps the two from
 * drifting: adding a refusal case, or a field to one, makes THIS file a tsc
 * error rather than a runtime `.parse()` failure in the browser. Never relax it
 * to a cast.
 */
const BundleRefusalSchema = z.union([
  z.object({
    kind: z.literal("no-releases"),
    composition: z.string(),
    platform: z.string(),
    compDir: z.string(),
    namespace: z.string(),
  }),
  z.object({
    kind: z.literal("no-such-run"),
    release: z.string(),
    runDir: z.string(),
    compDir: z.string(),
    available: z.array(z.string()),
    namespace: z.string(),
  }),
  z.object({
    kind: z.literal("no-pointer"),
    pointer: z.string(),
    pointerPath: z.string(),
    namespace: z.string(),
  }),
  z.object({ kind: z.literal("no-manifest"), runDir: z.string() }),
  z.object({
    kind: z.literal("wrong-composition"),
    manifestPath: z.string(),
    found: z.string(),
    expected: z.string(),
  }),
  z.object({
    kind: z.literal("wrong-target"),
    manifestPath: z.string(),
    found: z.string(),
  }),
  z.object({
    kind: z.literal("platform-mismatch"),
    manifestPath: z.string(),
    found: z.string(),
    expected: z.string(),
  }),
  z.object({
    kind: z.literal("inconsistent-run-id"),
    manifestPath: z.string(),
    declared: z.string(),
    runId: z.string(),
  }),
  z.object({ kind: z.literal("not-packed"), localPath: z.string() }),
]) satisfies z.ZodType<BundleRefusal>;

export const BundleResolutionSchema = z.union([
  z.object({
    ok: z.literal(true),
    runId: z.string(),
    localPath: z.string(),
    binaryName: z.string(),
    manifest: ReleaseManifestSchema,
  }),
  z.object({ ok: z.literal(false), refusal: BundleRefusalSchema }),
]) satisfies z.ZodType<BundleResolution>;

export const StalenessSchema = z.union([
  z.object({ kind: z.literal("current") }),
  z.object({ kind: z.literal("behind"), commits: z.number().int() }),
  z.object({ kind: z.literal("diverged"), sha: z.string() }),
  z.object({ kind: z.literal("unknown"), reason: z.string() }),
]) satisfies z.ZodType<Staleness>;

/**
 * What `ship` would do for one `(composition, platform)`, and what it would be
 * shipping.
 *
 * The split between the three fields is the point, and consumers must respect
 * it: **the filesystem says whether a shippable bundle exists and matches** —
 * that is `resolution`, the EXACT value `ship` itself acts on, so a UI renders
 * `bundleRefusalMessage(resolution.refusal)` verbatim and never re-derives
 * shippability — while **the DB says where it came from**, which is `run`.
 *
 * `run` is legitimately `null`: a hand-run `./singularity release` is
 * deliberately not recorded in `release_runs` (the filesystem is the registry —
 * see `plugins/release/CLAUDE.md` §Discovery), so "there is a perfectly good
 * bundle and no row for it" is an expected answer, not an error.
 */
export const ReleaseCandidateResponseSchema = z.object({
  resolution: BundleResolutionSchema,
  run: ReleaseRunSchema.nullable(),
  staleness: StalenessSchema,
});
export type ReleaseCandidateResponse = z.infer<typeof ReleaseCandidateResponseSchema>;
