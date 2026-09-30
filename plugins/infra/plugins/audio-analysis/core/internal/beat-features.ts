import { z } from "zod";

/**
 * The analysis version: part of every features file's path
 * (`beat-features/v<N>/<settingsKey>/<videoId>.json`) and of the JSON. Bump it
 * when the extractor's output changes meaning — every video then reads as
 * `absent` and is re-analysed, so old and new results never mix. Cached audio
 * survives. v2: one soxr resample of the whole signal replaced PyAV's
 * per-frame resampler, and the settings joined the path.
 */
export const ANALYSIS_VERSION = 2;

/**
 * The Beat This! checkpoint: `final0` is the paper's main model, `small0` its
 * small variant (≈10× fewer parameters, several times faster).
 */
export const BeatModelSchema = z.enum(["small0", "final0"]);
export type BeatModel = z.infer<typeof BeatModelSchema>;

/**
 * The chroma pipeline, both the harmonic part (HPSS) of one tuning-compensated
 * CQT, treble and bass. `full`: tuning from every STFT frame, a CQT frame
 * every 23 ms. `fast`: tuning from every 4th frame, a CQT frame every 46 ms —
 * ≈4× cheaper, per-beat profiles within ≈0.98 (centred cosine) of `full`.
 */
export const ChromaVariantSchema = z.enum(["fast", "full"]);
export type ChromaVariant = z.infer<typeof ChromaVariantSchema>;

/**
 * The settings that change what the extractor outputs — and so which cache
 * entry a video's features live in. The device is not one of them: CPU and
 * MPS give the same features (measured), so it is recorded, not keyed.
 */
export const AnalysisSettingsSchema = z.object({
  beatModel: BeatModelSchema,
  chroma: ChromaVariantSchema,
});
export type AnalysisSettings = z.infer<typeof AnalysisSettingsSchema>;

/**
 * The cache path segment of a settings combination, e.g. `small0-fastchroma`:
 * readable, and one per combination, so features computed with different
 * settings never share a file.
 */
export function settingsKey(settings: AnalysisSettings): string {
  return `${settings.beatModel}-${settings.chroma}chroma`;
}

/** 12 bins, C..B, each 0–1 (max-normalised: the strongest bin is 1). */
const PitchClassProfile = z.array(z.number().min(0).max(1)).length(12);

/** One beat: it spans `[t, next beat's t)`; the last ends at `durationSec`. */
export const BeatSchema = z.object({
  /** Seconds from the start of the audio. */
  t: z.number().nonnegative(),
  downbeat: z.boolean(),
  /** 1-based position in its bar; 0 before the first downbeat. */
  barPos: z.number().int().nonnegative(),
  /** Treble CQT (MIDI ≈48–95), harmonic part, beat-synchronous median. */
  chroma: PitchClassProfile,
  /** Bass CQT (MIDI ≈28–52), same treatment: roots and inversions. */
  bass: PitchClassProfile,
  /** The span's loudness relative to the song's loudest beat (0–1). */
  rms: z.number().min(0).max(1),
});
export type Beat = z.infer<typeof BeatSchema>;

/**
 * Contract 1 of the Sonata sheet-alignment work
 * (`research/2026-09-29-apps-sonata-ug-sheet-alignment.md`): what the aligner
 * reads for one YouTube video. Floats are rounded to 4 decimals (a 4-minute
 * song is ≈100 KB).
 */
export const BeatFeaturesSchema = z.object({
  videoId: z.string(),
  analysisVersion: z.number().int().positive(),
  durationSec: z.number().positive(),
  /** Of the analysed signal (Hz). */
  sampleRate: z.number().int().positive(),
  /** Estimated offset from A440, already compensated in the chroma. */
  tuningCents: z.number(),
  beats: z.array(BeatSchema),
  source: z.object({
    /** The audio container as downloaded (`webm`, `m4a`). */
    audioFormat: z.string(),
    ytDlpVersion: z.string(),
    /** The beat tracker and checkpoint, e.g. `beat_this small0`. */
    model: z.string(),
    /** Where the beat tracker ran (`auto` resolved). */
    device: z.enum(["cpu", "mps"]),
    /** The settings the features were computed with (their cache key). */
    settings: AnalysisSettingsSchema,
  }),
});
export type BeatFeatures = z.infer<typeof BeatFeaturesSchema>;

/**
 * Where the beat tracker runs: `auto` is MPS when torch can use it (Apple
 * Silicon), else CPU. An explicit `mps` that torch cannot use fails the run.
 */
export const AnalysisDeviceSchema = z.enum(["auto", "cpu", "mps"]);
export type AnalysisDevice = z.infer<typeof AnalysisDeviceSchema>;
