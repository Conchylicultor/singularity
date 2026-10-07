import { describe, expect, it } from "bun:test";
import { ALIGNER_VERSION, sheetHash, type AlignmentRecord } from "./record";
import { appliedAlignment } from "./source-raw";

const CONTENT = "[Verse]\n[ch]G[/ch]\nla";
const VIDEO = "dQw4w9WgXcQ";

function record(over: Partial<AlignmentRecord> = {}): AlignmentRecord {
  return {
    alignerVersion: ALIGNER_VERSION,
    videoId: VIDEO,
    analysisVersion: 1,
    settingsKey: "final0-fastchroma",
    sheetHash: sheetHash(CONTENT),
    durationSec: 4,
    beats: [0, 1, 2, 3].map((t) => ({ t, downbeat: t === 0 })),
    transpose: 0,
    segments: [{ kind: "gap", startBeat: 0, endBeat: 4 }],
    barConfidence: [1],
    score: 0.9,
    ...over,
  };
}

describe("appliedAlignment", () => {
  it("applies the record made for the row's video and this sheet", () => {
    const r = record();
    expect(appliedAlignment({ videoId: VIDEO, record: r }, CONTENT)).toBe(r);
  });

  it("is null with no row or no record", () => {
    expect(appliedAlignment(null, CONTENT)).toBeNull();
    expect(
      appliedAlignment({ videoId: VIDEO, record: null }, CONTENT),
    ).toBeNull();
  });

  it("drops the previous video's record once a new video is set", () => {
    expect(
      appliedAlignment({ videoId: "aaaaaaaaaaa", record: record() }, CONTENT),
    ).toBeNull();
  });

  it("drops a record for another sheet or another aligner", () => {
    expect(
      appliedAlignment({ videoId: VIDEO, record: record() }, `${CONTENT}!`),
    ).toBeNull();
    expect(
      appliedAlignment(
        {
          videoId: VIDEO,
          record: record({ alignerVersion: ALIGNER_VERSION - 1 }),
        },
        CONTENT,
      ),
    ).toBeNull();
  });

  it("applies a weak match: the song plays on its best try", () => {
    const weak = record({ score: 0.1 });
    expect(appliedAlignment({ videoId: VIDEO, record: weak }, CONTENT)).toBe(
      weak,
    );
  });

  it("applies the resolver's best try when no video was chosen (needs-video)", () => {
    const best = record({ score: 0.45 });
    expect(appliedAlignment({ videoId: null, record: best }, CONTENT)).toBe(
      best,
    );
  });
});
