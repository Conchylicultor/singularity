import { describe, expect, it } from "bun:test";
import type { LiveRowResult } from "@plugins/network/plugins/live/web";
import type { UgTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import {
  ALIGNER_VERSION,
  sheetHash,
  type AlignmentCandidate,
  type UgAlignmentRow,
} from "../../core";
import type { AlignmentRecord } from "../../core/internal/record";
import {
  formatTranspose,
  recordingState,
  recordingStateLine,
  recordingStateSummary,
} from "./recording-state";

const tab: UgTab = {
  tabId: "1",
  songName: "Song",
  artistName: "Artist",
  type: "Chords",
  key: null,
  capo: 2,
  tuning: "E A D G B E",
  content: "[Verse]\n[ch]G[/ch]\nla",
  urlWeb: "https://tabs.ultimate-guitar.com/tab/1",
};

const VIDEO = "dQw4w9WgXcQ";

function record(over: Partial<AlignmentRecord> = {}): AlignmentRecord {
  return {
    alignerVersion: ALIGNER_VERSION,
    videoId: VIDEO,
    analysisVersion: 1,
    settingsKey: "final0-fastchroma",
    sheetHash: sheetHash(tab.content),
    durationSec: 4,
    beats: [0, 1, 2, 3].map((t) => ({ t, downbeat: t === 0 })),
    transpose: 2,
    segments: [{ kind: "gap", startBeat: 0, endBeat: 4 }],
    barConfidence: [1],
    score: 0.82,
    ...over,
  };
}

const refetch = () => Promise.resolve();

function found(over: Partial<UgAlignmentRow>): LiveRowResult<UgAlignmentRow> {
  return {
    status: "ready",
    found: true,
    refetch,
    row: {
      songId: "s1",
      videoId: VIDEO,
      status: "queued",
      phase: null,
      error: null,
      errorPermanent: false,
      pick: "user",
      candidates: [],
      record: null,
      updatedAt: new Date(0),
      ...over,
    } as UgAlignmentRow,
  };
}

describe("recordingState", () => {
  it("is loading while the row is not known, never 'no video'", () => {
    expect(recordingState({ status: "loading", refetch }, tab).kind).toBe(
      "loading",
    );
  });

  it("is no-video for a song without a row", () => {
    expect(
      recordingState({ status: "ready", found: false, refetch }, tab).kind,
    ).toBe("no-video");
  });

  it("shows the aligned score and the signed transpose with the capo", () => {
    const state = recordingState(
      found({ status: "aligned", record: record() }),
      tab,
    );
    expect(state).toEqual({
      kind: "aligned",
      videoId: VIDEO,
      score: 0.82,
      transpose: 2,
      capo: 2,
    });
    expect(recordingStateLine(state)).toBe(
      "Aligned 82% · +2 (capo 2) semitones",
    );
    // The collapsed header gets the short form; the sentence stays in the body.
    expect(recordingStateSummary(state)).toBe("82%");
  });

  it("reads a transpose above a tritone as the downward interval", () => {
    const state = recordingState(
      found({ status: "aligned", record: record({ transpose: 10 }) }),
      tab,
    );
    expect(state.kind === "aligned" && state.transpose).toBe(-2);
  });

  it("is out of date when the record was aligned to another sheet", () => {
    expect(
      recordingState(
        found({ status: "aligned", record: record({ sheetHash: "other" }) }),
        tab,
      ).kind,
    ).toBe("out-of-date");
  });

  it("is out of date when the record was made by another aligner version", () => {
    expect(
      recordingState(
        found({
          status: "aligned",
          record: record({ alignerVersion: ALIGNER_VERSION + 1 }),
        }),
        tab,
      ).kind,
    ).toBe("out-of-date");
  });

  it("is a weak match below the threshold", () => {
    const state = recordingState(
      found({ status: "weak", record: record({ score: 0.31 }) }),
      tab,
    );
    expect(recordingStateLine(state)).toBe(
      "Weak match (31%) — playing it, but the timing is unconfirmed; a better video may align",
    );
    expect(recordingStateSummary(state)).toBe("Weak · 31%");
  });

  it("carries a failure's message and permanence", () => {
    expect(
      recordingState(
        found({ status: "failed", error: "gone", errorPermanent: true }),
        tab,
      ),
    ).toEqual({
      kind: "failed",
      videoId: VIDEO,
      message: "gone",
      permanent: true,
    });
  });

  it("shows the running phase", () => {
    const state = recordingState(
      found({ status: "running", phase: "aligning" }),
      tab,
    );
    expect(recordingStateLine(state)).toBe("Aligning the sheet…");
  });
});

function candidate(
  videoId: string,
  over: Partial<AlignmentCandidate> = {},
): AlignmentCandidate {
  return {
    videoId,
    title: null,
    channel: null,
    rank: 0,
    sources: ["youtube-search"],
    outcome: "untried",
    score: null,
    error: null,
    ...over,
  };
}

describe("recordingState — the resolver's choice", () => {
  const auto = { pick: "auto" as const, videoId: null };

  it("is finding a video while it searches", () => {
    const state = recordingState(found({ ...auto, status: "resolving" }), tab);
    expect(state).toEqual({
      kind: "finding",
      trying: null,
      phase: null,
      tried: 0,
    });
    expect(recordingStateLine(state)).toBe("Finding a video…");
    expect(recordingStateSummary(state)).toBe("Finding a video…");
  });

  it("a queued new song is finding a video too, never 'no recording'", () => {
    expect(recordingState(found({ ...auto, status: "queued" }), tab).kind).toBe(
      "finding",
    );
  });

  it("names the candidate it is trying", () => {
    const state = recordingState(
      found({
        ...auto,
        status: "resolving",
        phase: "aligning",
        candidates: [
          candidate("AAAAAAAAAAA", { outcome: "weak", score: 0.2 }),
          candidate("BBBBBBBBBBB", { outcome: "trying", title: "Wonderwall" }),
        ],
      }),
      tab,
    );
    expect(state).toMatchObject({ kind: "finding", tried: 1 });
    expect(recordingStateLine(state)).toBe("Trying Wonderwall (aligning)…");
  });

  it("needs a video once the candidates tried all fell short, with the count and best score", () => {
    const state = recordingState(
      found({
        ...auto,
        status: "needs-video",
        candidates: [
          candidate("AAAAAAAAAAA", { outcome: "weak", score: 0.31 }),
          candidate("BBBBBBBBBBB", { outcome: "failed" }),
          candidate("CCCCCCCCCCC", { outcome: "weak", score: 0.22 }),
          candidate("DDDDDDDDDDD"),
        ],
      }),
      tab,
    );
    expect(state).toEqual({ kind: "needs-video", tried: 3, best: 0.31 });
    expect(recordingStateLine(state)).toBe(
      "Needs a video — playing the best try, a weak match (31%, 3 tried); the timing is unconfirmed",
    );
    expect(recordingStateSummary(state)).toBe("Needs a video");
  });

  it("needs a video with nothing scored says so without a percentage", () => {
    expect(
      recordingStateLine(
        recordingState(found({ ...auto, status: "needs-video" }), tab),
      ),
    ).toBe("Needs a video (0 tried)");
  });

  it("an automatically picked video reads like any other once aligned", () => {
    expect(
      recordingState(
        found({ pick: "auto", status: "aligned", record: record() }),
        tab,
      ).kind,
    ).toBe("aligned");
  });

  it("a user row with no video is 'no recording'", () => {
    expect(recordingState(found({ videoId: null }), tab).kind).toBe("no-video");
  });
});

describe("formatTranspose", () => {
  it("signs the interval and names the capo", () => {
    expect(formatTranspose(0, 0)).toBe("0");
    expect(formatTranspose(-3, 0)).toBe("−3");
    expect(formatTranspose(2, 2)).toBe("+2 (capo 2)");
  });
});
