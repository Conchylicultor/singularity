import { describe, expect, test } from "bun:test";
import {
  ANALYSIS_VERSION,
  BeatFeaturesSchema,
  BeatModelSchema,
  ChromaVariantSchema,
  settingsKey,
  type BeatFeatures,
} from "./beat-features";

const pcp = (hot: number) =>
  Array.from({ length: 12 }, (_, i) => (i === hot ? 1 : 0.25));

const sample: BeatFeatures = {
  videoId: "QDYfEBY9NM4",
  analysisVersion: ANALYSIS_VERSION,
  durationSec: 243.0267,
  sampleRate: 22050,
  tuningCents: 4,
  beats: [
    {
      t: 0.04,
      downbeat: false,
      barPos: 0,
      chroma: pcp(0),
      bass: pcp(0),
      rms: 0.1,
    },
    {
      t: 0.9,
      downbeat: true,
      barPos: 1,
      chroma: pcp(7),
      bass: pcp(7),
      rms: 0.5,
    },
    {
      t: 1.76,
      downbeat: false,
      barPos: 2,
      chroma: pcp(9),
      bass: pcp(9),
      rms: 1,
    },
  ],
  source: {
    audioFormat: "webm",
    ytDlpVersion: "2026.08.19",
    model: "beat_this small0",
    device: "mps",
    settings: { beatModel: "small0", chroma: "fast" },
  },
};

describe("BeatFeaturesSchema", () => {
  test("round-trips through JSON", () => {
    const parsed = BeatFeaturesSchema.parse(JSON.parse(JSON.stringify(sample)));
    expect(parsed).toEqual(sample);
  });

  test("a chroma or bass vector must have exactly 12 bins", () => {
    const short = structuredClone(sample);
    short.beats[0]!.chroma = short.beats[0]!.chroma.slice(0, 11);
    expect(BeatFeaturesSchema.safeParse(short).success).toBe(false);
    const long = structuredClone(sample);
    long.beats[1]!.bass = [...long.beats[1]!.bass, 0];
    expect(BeatFeaturesSchema.safeParse(long).success).toBe(false);
  });

  test("bins and rms are 0–1, the device is cpu or mps", () => {
    const loud = structuredClone(sample);
    loud.beats[2]!.rms = 1.2;
    expect(BeatFeaturesSchema.safeParse(loud).success).toBe(false);
    const gpu = JSON.parse(JSON.stringify(sample)) as {
      source: { device: string };
    };
    gpu.source.device = "cuda";
    expect(BeatFeaturesSchema.safeParse(gpu).success).toBe(false);
  });
});

describe("settingsKey", () => {
  test("is readable", () => {
    expect(settingsKey({ beatModel: "small0", chroma: "fast" })).toBe(
      "small0-fastchroma",
    );
  });

  test("is distinct for every settings combination", () => {
    const keys = BeatModelSchema.options.flatMap((beatModel) =>
      ChromaVariantSchema.options.map((chroma) =>
        settingsKey({ beatModel, chroma }),
      ),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
